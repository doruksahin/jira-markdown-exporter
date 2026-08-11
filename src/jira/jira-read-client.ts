import { Version3Client } from 'jira.js/version3';
import type { Version3Models, Version3Parameters } from 'jira.js/version3';
import type { JiraConfig } from '../config/jira-config.js';

/**
 * The only Jira JSON operations this exporter is allowed to perform.
 *
 * Keep this deliberately smaller than `Version3Client`: the exporter is
 * read-only and does not need Jira's mutation APIs. Attachment bytes are not
 * included here because they use the separately guarded native-fetch path.
 */
export interface JiraReadClient {
  searchIssues(parameters: Version3Parameters.SearchForIssuesUsingJqlEnhancedSearch): Promise<Version3Models.SearchAndReconcileResults>;
  getIssue(parameters: Version3Parameters.GetIssue): Promise<Version3Models.Issue>;
  getComments(parameters: Version3Parameters.GetComments): Promise<Version3Models.PageOfComments>;
}

/** Production implementation backed by the typed Jira Cloud v3 client. */
export class JiraSdkReadClient implements JiraReadClient {
  private readonly client: Version3Client;

  constructor(config: JiraConfig) {
    this.client = new Version3Client({
      host: config.host,
      authentication: { basic: { email: config.email, apiToken: config.apiToken } },
    });
  }

  searchIssues(parameters: Version3Parameters.SearchForIssuesUsingJqlEnhancedSearch): Promise<Version3Models.SearchAndReconcileResults> {
    return this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearch(parameters);
  }

  getIssue(parameters: Version3Parameters.GetIssue): Promise<Version3Models.Issue> {
    return this.client.issues.getIssue(parameters);
  }

  getComments(parameters: Version3Parameters.GetComments): Promise<Version3Models.PageOfComments> {
    return this.client.issueComments.getComments(parameters);
  }
}
