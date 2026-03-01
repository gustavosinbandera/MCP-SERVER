# ClickUp API – Reference for the MCP agent

Minimal reference to integrate ClickUp via MCP tools (list workspaces/lists/tasks, create and update tasks). Works locally and on the instance using `CLICKUP_API_TOKEN`.

## Official links

- [ClickUp API](https://developer.clickup.com/)
- [Getting Started](https://developer.clickup.com/docs/Getting%20Started)
- [API Reference](https://developer.clickup.com/reference)
- [OpenAPI spec](https://developer.clickup.com/docs/open-api-spec)
- [API v2 / v3 terminology](https://developer.clickup.com/docs/general-v2-v3-api)

## Authentication

- **Personal API Token (recommended for this agent):** Generate it in ClickUp: **Settings → Apps → API Token**. Tokens usually start with `pk_`. They don’t expire.
- **How to get the token:** In ClickUp, click your avatar or **Settings** → **Apps** (or **My Apps**) → **API Token** → **Generate**. Copy and store the token; it’s shown only once.
- **Header:** For every request: `Authorization: <token>` (literal token value; no "Bearer" prefix in ClickUp API v2).
- **Environment variable:** `CLICKUP_API_TOKEN` in `.env` or `gateway/.env` (local) and in the project `.env` on the EC2 instance (or container env vars). See `gateway/.env.example`.

## Base URL

```
https://api.clickup.com/api/v2
```

## API v2 terminology

| API v2 term | Meaning |
|----------------|-------------|
| Team           | Workspace (organization) |
| Space          | Space within a workspace |
| Folder         | Folder within a space (can contain lists) |
| List           | Task list (where tasks are created) |
| Task           | Task / ticket |

## Endpoints used by the agent

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/user` | Authorized user (current token). Returns `id`, `username`, etc. Useful for `assignees`. |
| GET    | `/team` | List workspaces (teams). Returns array with `id`, `name`, etc. |
| GET    | `/team/{team_id}/space` | List spaces in a workspace. Param: `team_id`. |
| GET    | `/space/{space_id}/folder` | List folders in a space. Param: `space_id`. Includes folderless lists. |
| GET    | `/folder/{folder_id}/list` | List lists in a folder. Param: `folder_id`. |
| GET    | `/list/{list_id}/task` | List tasks in a list. Optional query: `archived`, `statuses`, etc. |
| POST   | `/list/{list_id}/task` | Create task. Body: `name` (required), `description`, **`markdown_description`** (recommended for Markdown), `status`, `assignees`, etc. |
| GET    | `/task/{task_id}` | Get a task by ID. Optional query: `include_markdown_description=true` to return the description in Markdown. |
| PUT    | `/task/{task_id}` | Update task. Body: `name`, `markdown_description`, `status`, `priority` (1–4), `time_estimate` (ms), etc. |
| POST   | `/task/{task_id}/tag/{tag_name}` | Add a tag to a task. Body: `{ "workspace_id": "..." }`. Tag must exist in the workspace. |
| POST   | `/team/{team_id}/time_entries` | Create a time entry. Body: `task_id`, `duration` (ms), `start` (Unix ms), `description`, `billable`. |
| POST   | `/task/{task_id}/link` | Link a task to another. Body: `{ "links_to": "other_task_id" }`. |

## Markdown descriptions

If you send a Markdown-like description in the `description` field (e.g. `##`, ```), ClickUp may display it as plain text. For proper rendering (headings, code blocks, lists):

- **Create task:** use `markdown_description` in the POST body.
- **Update task:** use `markdown_description` in the PUT body.

The client in `gateway/src/clickup-client.ts` and the script `gateway/scripts/clickup/update-clickup-tasks-in-progress.cjs` already use `markdown_description`.

## Responses and errors

- **200:** OK; JSON body with data.
- **401:** Invalid/missing token. Check `CLICKUP_API_TOKEN`.
- **404:** Resource not found (wrong team_id/list_id/task_id).
- **429:** Rate limit. Retry after the time suggested by the response.

## Configuration on the instance

To use ClickUp tools via MCP on the EC2 instance:

1. SSH into the instance.
2. Edit the project `.env` (e.g. `~/MCP-SERVER/.env` or `~/MCP-SERVER/gateway/.env` depending on how the gateway is started).
3. Add: `CLICKUP_API_TOKEN=pk_...` (your Personal API Token).
4. Restart the gateway/MCP service if it’s running (e.g. `docker compose restart gateway`, or whatever process serves MCP).

See also [COMANDOS-INSTANCIA-EC2.md](COMANDOS-INSTANCIA-EC2.md) for SSH and service management.

## Generic task scripts (CLI)

From `gateway/` you can create tasks/subtasks without writing new scripts. They require `CLICKUP_API_TOKEN` in `gateway/.env`. Optional: `LIST_ID`, `ASSIGNEE_USER_ID` (otherwise it uses the first list in the workspace and the token user).

### Create a task (and optionally subtasks)

```bash
node scripts/clickup/create-clickup-task.cjs --title "Task title"
node scripts/clickup/create-clickup-task.cjs --title "Title" --description "Plain text description"
node scripts/clickup/create-clickup-task.cjs --title "Title" --markdown-file docs/task.md
node scripts/clickup/create-clickup-task.cjs --title "Title" --subtasks "Sub1,Sub2,Sub3"
node scripts/clickup/create-clickup-task.cjs --title "Title" --subtasks-file subtasks.txt
node scripts/clickup/create-clickup-task.cjs --title "Title" --list-id 901325668563 --priority 2
```

| Option | Description |
|--------|-------------|
| `--title "..."` | **(required)** Task name |
| `--description "..."` | Plain-text description |
| `--description-file path` | Description from file (plain text) |
| `--markdown "..."` / `--markdown-file path` | Markdown description (renders in ClickUp) |
| `--subtasks "A,B,C"` | Comma-separated subtasks |
| `--subtasks-file path` | One subtask per line |
| `--list-id id` | ClickUp list (or `LIST_ID` in .env, or first list) |
| `--assignee id` | Assignee user ID |
| `--priority 1\|2\|3\|4` | 1=urgent, 2=high, 3=normal, 4=low |
| `--status "name"` | Initial status |

### Add subtasks to an existing task

```bash
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --title "New subtask"
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --titles "A,B,C"
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --titles-file path.txt
```

| Option | Description |
|--------|-------------|
| `--parent-id id` | **(required)** Parent task ID |
| `--list-id id` | Parent task list (or `LIST_ID` in .env) |
| `--title "..."` | One subtask |
| `--titles "A,B,C"` | Multiple comma-separated subtasks |
| `--titles-file path` | One subtask per line |
| `--assignee id` | Assignee user ID |

### Seed subtasks for the "HTTP Streamable" task

To add the 24 subtasks (HTTP Streamable module plan + Cursor MCP + 504 issues) to the parent task and leave them with descriptions and completed:

```bash
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --parent-id <task_id>
```

Get `<task_id>` from the task URL in ClickUp (e.g. `https://app.clickup.com/t/86abc123x` → `86abc123x`) or by listing tasks in the list using the MCP tool `clickup_list_tasks`.
