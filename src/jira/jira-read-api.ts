import type { AgileModels } from 'jira.js/agile';
import type { Version3Models } from 'jira.js/version3';
import type { JiraConfig } from '../config/jira-config.js';
import { ExporterTransportError, type JiraGetTransport } from '../transport.js';
import { adfToPlainText } from './adf-to-markdown.js';
import { jiraGetJson } from './transport-jira-client.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const STANDARD_ISSUE_FIELDS = Object.freeze([
  'summary', 'description', 'status', 'priority', 'updated', 'issuetype',
  'parent', 'labels', 'assignee', 'comment',
]);

export interface JiraUserRecord {
  readonly accountId: string;
  readonly displayName: string;
  readonly emailAddress: string;
  readonly active: boolean | null;
}

export interface JiraProjectRecord {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

export interface JiraBoardRecord {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

export interface JiraFieldRecord {
  readonly id: string;
  readonly name: string;
  readonly customSchema: string;
}

export interface JiraSprintRecord {
  readonly id: string;
  readonly name: string;
  readonly state: 'future' | 'active' | 'closed' | 'unknown';
  readonly startDate: string;
  readonly endDate: string;
  readonly completeDate: string;
  readonly goal: string;
}

export interface JiraIssueRecord {
  readonly key: string;
  readonly url: string;
  readonly summary: string;
  readonly description: string;
  readonly status: string;
  readonly statusCategory: string;
  readonly priority: string;
  readonly issueType: string;
  readonly storyPoints: string;
  readonly updated: string;
  readonly assignee: JiraUserRecord | null;
  readonly assigneeEvidenceComplete: boolean;
  readonly commentCount: number;
  readonly parentKey: string;
  readonly labels: readonly string[];
}

export interface JiraIssueEvidence {
  readonly issue: JiraIssueRecord;
  readonly assigneeEvidenceComplete: boolean;
  readonly sprintEvidenceComplete: boolean;
  readonly sprints: readonly JiraSprintRecord[];
}

export interface JiraIssueList {
  readonly issues: readonly JiraIssueRecord[];
  readonly total: number;
}

export interface JiraReadApi {
  probeMyself(): Promise<JiraUserRecord>;
  probeProject(projectKey: string): Promise<JiraProjectRecord>;
  probeBoard(boardId: string | number): Promise<JiraBoardRecord>;
  findAssignableUser(input: Readonly<{ projectKey: string; accountId: string }>): Promise<JiraUserRecord | null>;
  listFields(): Promise<readonly JiraFieldRecord[]>;
  getIssue(input: Readonly<{
    issueKey: string;
    storyPointsField: string;
  }>): Promise<JiraIssueRecord>;
  getTaskRecordEvidence(input: Readonly<{
    issueKey: string;
    storyPointsField: string;
    sprintField: string;
  }>): Promise<JiraIssueEvidence>;
  listBoardSprints(input: Readonly<{
    boardId: string | number;
    states: readonly ('future' | 'active' | 'closed')[];
  }>): Promise<readonly JiraSprintRecord[]>;
  listSprintIssues(input: Readonly<{
    sprintId: string | number;
    projectKey: string;
    assigneeAccountId: string;
    storyPointsField: string;
  }>): Promise<JiraIssueList>;
  listBoardIssues(input: Readonly<{
    boardId: string | number;
    projectKey: string;
    assigneeAccountId: string;
    unresolvedOnly: true;
    orderByUpdatedDesc: true;
    storyPointsField: string;
  }>): Promise<JiraIssueList>;
}

export function createJiraReadApi(
  config: Pick<JiraConfig, 'host'>,
  dependencies: Readonly<{ jiraGet: JiraGetTransport }>,
): JiraReadApi {
  if (!dependencies || typeof dependencies.jiraGet !== 'function') {
    throw new ExporterTransportError('JIRA_TRANSPORT_INVALID_RESPONSE', 'jira-json');
  }
  return new JiraTransportReadApi(config, dependencies.jiraGet);
}

class JiraTransportReadApi implements JiraReadApi {
  private readonly jiraOrigin: string;

  constructor(private readonly config: Pick<JiraConfig, 'host'>, private readonly transport: JiraGetTransport) {
    this.jiraOrigin = new URL(config.host).origin;
  }

  async probeMyself(): Promise<JiraUserRecord> {
    const user = await jiraGetJson(this.config, this.transport, 'jira-myself', '/rest/api/3/myself') as Version3Models.User;
    return normalizeUser(user);
  }

  async probeProject(projectKey: string): Promise<JiraProjectRecord> {
    const key = jiraProjectKey(projectKey);
    const project = await jiraGetJson(this.config, this.transport, 'jira-project', `/rest/api/3/project/${encodeURIComponent(key)}`) as Version3Models.Project;
    return Object.freeze({ id: String(project.id || ''), key: String(project.key || key), name: String(project.name || '') });
  }

  async probeBoard(boardId: string | number): Promise<JiraBoardRecord> {
    const id = jiraNumericId(boardId, 'board');
    const board = await jiraGetJson(this.config, this.transport, 'jira-board', `/rest/agile/1.0/board/${id}`) as AgileModels.GetBoard;
    return Object.freeze({ id: String(board.id ?? id), name: String(board.name || ''), type: String(board.type || '') });
  }

  async findAssignableUser(input: Readonly<{ projectKey: string; accountId: string }>): Promise<JiraUserRecord | null> {
    const project = jiraProjectKey(input.projectKey);
    const accountId = requiredValue(input.accountId, 'account ID');
    const users = await jiraGetJson(this.config, this.transport, 'jira-assignee', '/rest/api/3/user/assignable/search', {
      project,
      accountId,
      maxResults: PAGE_SIZE,
    }) as Version3Models.User[];
    const exact = users.find((user) => String(user.accountId || '') === accountId);
    return exact ? normalizeUser(exact) : null;
  }

  async listFields(): Promise<readonly JiraFieldRecord[]> {
    const fields = await jiraGetJson(this.config, this.transport, 'jira-fields', '/rest/api/3/field') as Version3Models.FieldDetails[];
    return Object.freeze(fields.map((field) => Object.freeze({
      id: String(field.id || ''),
      name: String(field.name || ''),
      customSchema: String(field.schema?.custom || ''),
    })).sort((left, right) => left.id.localeCompare(right.id)));
  }

  async getIssue(input: Readonly<{
    issueKey: string;
    storyPointsField: string;
  }>): Promise<JiraIssueRecord> {
    const key = jiraIssueKey(input.issueKey);
    const fields = issueFields(input.storyPointsField);
    const issue = await jiraGetJson(this.config, this.transport, 'jira-issue', `/rest/api/3/issue/${encodeURIComponent(key)}`, {
      fields,
    }) as Version3Models.Issue;
    return normalizeIssue(issue, input.storyPointsField, this.jiraOrigin);
  }

  async getTaskRecordEvidence(input: Readonly<{
    issueKey: string;
    storyPointsField: string;
    sprintField: string;
  }>): Promise<JiraIssueEvidence> {
    const key = jiraIssueKey(input.issueKey);
    const sprintField = jiraField(input.sprintField);
    const fields = issueFields(input.storyPointsField, [sprintField]);
    const issue = await jiraGetJson(this.config, this.transport, 'jira-issue', `/rest/api/3/issue/${encodeURIComponent(key)}`, {
      fields,
    }) as Version3Models.Issue;
    const rawFields = (issue.fields || {}) as Record<string, unknown>;
    const normalized = normalizeIssue(issue, input.storyPointsField, this.jiraOrigin);
    return Object.freeze({
      issue: normalized,
      assigneeEvidenceComplete: normalized.assigneeEvidenceComplete,
      sprintEvidenceComplete: Object.prototype.hasOwnProperty.call(rawFields, sprintField),
      sprints: normalizeSprintField(rawFields[sprintField]),
    });
  }

  async listBoardSprints(input: Readonly<{
    boardId: string | number;
    states: readonly ('future' | 'active' | 'closed')[];
  }>): Promise<readonly JiraSprintRecord[]> {
    const boardId = jiraNumericId(input.boardId, 'board');
    const states = [...new Set(input.states)];
    if (!states.length || states.some((state) => !['future', 'active', 'closed'].includes(state))) {
      throw new Error('Sprint states must be an explicit non-empty read-only set');
    }
    const values: JiraSprintRecord[] = [];
    let startAt = 0;
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const page = await jiraGetJson(this.config, this.transport, 'jira-board-sprints', `/rest/agile/1.0/board/${boardId}/sprint`, {
        startAt,
        maxResults: PAGE_SIZE,
        state: states.join(','),
      }) as { values?: AgileModels.Sprint[]; isLast?: boolean; total?: number };
      const batch = Array.isArray(page.values) ? page.values : [];
      values.push(...batch.map(normalizeSprint));
      if (page.isLast === true || startAt + batch.length >= Number(page.total || 0)) return Object.freeze(values);
      if (!batch.length) throw paginationError('jira-board-sprints');
      startAt += batch.length;
    }
    throw paginationError('jira-board-sprints');
  }

  async listSprintIssues(input: Readonly<{
    sprintId: string | number;
    projectKey: string;
    assigneeAccountId: string;
    storyPointsField: string;
  }>): Promise<JiraIssueList> {
    const sprintId = jiraNumericId(input.sprintId, 'sprint');
    const fields = issueFields(input.storyPointsField);
    const jql = ownershipJql(input.projectKey, input.assigneeAccountId, false, false);
    return this.issuePages(
      'jira-sprint-issues',
      fields,
      input.storyPointsField,
      (startAt) => jiraGetJson(this.config, this.transport, 'jira-sprint-issues', `/rest/agile/1.0/sprint/${sprintId}/issue`, {
        startAt, maxResults: PAGE_SIZE, jql, fields,
      }) as Promise<AgileModels.SearchResults>,
    );
  }

  async listBoardIssues(input: Readonly<{
    boardId: string | number;
    projectKey: string;
    assigneeAccountId: string;
    unresolvedOnly: true;
    orderByUpdatedDesc: true;
    storyPointsField: string;
  }>): Promise<JiraIssueList> {
    if (input.unresolvedOnly !== true || input.orderByUpdatedDesc !== true) {
      throw new Error('Board issue policy must explicitly select unresolved issues ordered by updated descending');
    }
    const boardId = jiraNumericId(input.boardId, 'board');
    const fields = issueFields(input.storyPointsField);
    const jql = ownershipJql(input.projectKey, input.assigneeAccountId, true, true);
    return this.issuePages(
      'jira-board-issues',
      fields,
      input.storyPointsField,
      (startAt) => jiraGetJson(this.config, this.transport, 'jira-board-issues', `/rest/agile/1.0/board/${boardId}/issue`, {
        startAt, maxResults: PAGE_SIZE, jql, fields,
      }) as Promise<AgileModels.SearchResults>,
    );
  }

  private async issuePages(
    operation: 'jira-board-issues' | 'jira-sprint-issues',
    fields: readonly string[],
    storyPointsField: string,
    read: (startAt: number) => Promise<AgileModels.SearchResults>,
  ): Promise<JiraIssueList> {
    const issues: JiraIssueRecord[] = [];
    let startAt = 0;
    let total = 0;
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const page = await read(startAt);
      const batch = Array.isArray(page.issues) ? page.issues : [];
      total = Number(page.total);
      if (!Number.isInteger(total) || total < 0) throw paginationError(operation);
      issues.push(...batch.map((issue) => normalizeIssue(
        issue as unknown as Version3Models.Issue,
        storyPointsField,
        this.jiraOrigin,
      )));
      if (issues.length >= total) return Object.freeze({ issues: Object.freeze(issues), total });
      if (!batch.length) throw paginationError(operation);
      startAt += batch.length;
    }
    throw paginationError(operation);
  }
}

function normalizeUser(user: Partial<Version3Models.User> | null | undefined): JiraUserRecord {
  return Object.freeze({
    accountId: String(user?.accountId || ''),
    displayName: String(user?.displayName || ''),
    emailAddress: String(user?.emailAddress || ''),
    active: typeof user?.active === 'boolean' ? user.active : null,
  });
}

function normalizeSprint(sprint: AgileModels.Sprint): JiraSprintRecord {
  const state = ['future', 'active', 'closed'].includes(String(sprint.state))
    ? sprint.state as JiraSprintRecord['state'] : 'unknown';
  return Object.freeze({
    id: String(sprint.id || ''),
    name: String(sprint.name || ''),
    state,
    startDate: String(sprint.startDate || ''),
    endDate: String(sprint.endDate || ''),
    completeDate: String(sprint.completeDate || ''),
    goal: String(sprint.goal || ''),
  });
}

function normalizeSprintField(value: unknown): readonly JiraSprintRecord[] {
  if (value === null || value === undefined) return Object.freeze([]);
  const entries = Array.isArray(value) ? value : [value];
  if (entries.some((entry) => !entry || typeof entry !== 'object')) {
    throw new ExporterTransportError('JIRA_TRANSPORT_INVALID_RESPONSE', 'jira-issue');
  }
  return Object.freeze(entries.map((entry) => normalizeSprint(entry as AgileModels.Sprint)));
}

function normalizeIssue(
  issue: Version3Models.Issue,
  storyPointsField: string,
  jiraOrigin: string,
): JiraIssueRecord {
  const fields = (issue.fields || {}) as Record<string, unknown>;
  const status = record(fields.status);
  const statusCategory = record(status.statusCategory);
  const priority = record(fields.priority);
  const issueType = record(fields.issuetype);
  const assignee = Object.prototype.hasOwnProperty.call(fields, 'assignee') ? record(fields.assignee) : null;
  const parent = record(fields.parent);
  const comment = record(fields.comment);
  return Object.freeze({
    key: String(issue.key || ''),
    url: `${jiraOrigin}/browse/${String(issue.key || '')}`,
    summary: String(fields.summary || 'Untitled issue'),
    description: adfToPlainText(fields.description),
    status: String(status.name || 'Unknown'),
    statusCategory: String(statusCategory.key || ''),
    priority: String(priority.name || ''),
    issueType: String(issueType.name || ''),
    storyPoints: String(fields[storyPointsField] ?? ''),
    updated: String(fields.updated || ''),
    assignee: assignee && Object.keys(assignee).length ? normalizeUser(assignee as Partial<Version3Models.User>) : null,
    assigneeEvidenceComplete: Object.prototype.hasOwnProperty.call(fields, 'assignee'),
    commentCount: Number(comment.total || 0),
    parentKey: String(parent.key || ''),
    labels: Object.freeze(Array.isArray(fields.labels) ? fields.labels.map(String).filter(Boolean) : []),
  });
}

function ownershipJql(projectKey: string, accountId: string, unresolved: boolean, order: boolean): string {
  const clauses = [
    `project = "${jqlValue(jiraProjectKey(projectKey))}"`,
    `assignee = "${jqlValue(requiredValue(accountId, 'account ID'))}"`,
  ];
  if (unresolved) clauses.push('resolution = Unresolved');
  return `${clauses.join(' AND ')}${order ? ' ORDER BY updated DESC' : ''}`;
}

function jqlValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function issueFields(storyPointsField: string, extra: readonly string[] = []): string[] {
  return jiraFields([...STANDARD_ISSUE_FIELDS, jiraField(storyPointsField), ...extra]);
}

function jiraField(value: string): string {
  const field = String(value || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(field)) throw new Error('Invalid Jira field ID');
  return field;
}

function jiraFields(values: readonly string[]): string[] {
  const fields = [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!fields.length || fields.some((field) => !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(field))) {
    throw new Error('Jira fields must be an explicit non-empty safe field list');
  }
  return fields;
}

function jiraProjectKey(value: string): string {
  const key = requiredValue(value, 'project key').toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(key)) throw new Error('Invalid Jira project key');
  return key;
}

function jiraIssueKey(value: string): string {
  const key = requiredValue(value, 'issue key').toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,31}-[1-9]\d*$/.test(key)) throw new Error('Invalid Jira issue key');
  return key;
}

function jiraNumericId(value: string | number, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid Jira ${label} ID`);
  return id;
}

function requiredValue(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 256) throw new Error(`Invalid Jira ${label}`);
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function paginationError(operation: 'jira-board-sprints' | 'jira-board-issues' | 'jira-sprint-issues'): ExporterTransportError {
  return new ExporterTransportError('JIRA_PAGINATION_INVALID', operation);
}
