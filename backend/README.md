# Open Codex Backend

Backend server for Open Codex GUI - A local LLM agent development environment.

## Setup

### Prerequisites

- Python 3.11 or higher
- Docker (for sandbox execution)

### Installation

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Edit `.env` and add your LLM API keys (OpenAI, Anthropic, etc.)

### Running the Server

```bash
python -m app.main
```

Or with uvicorn directly:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at `http://127.0.0.1:8000`

API documentation at `http://127.0.0.1:8000/docs`

## Development

### Running Tests

```bash
pytest
```

### Code Formatting

```bash
black .
ruff check .
```

## API Endpoints

### Projects
- `GET /api/v1/projects` - List all projects
- `POST /api/v1/projects` - Create a new project
- `GET /api/v1/projects/{id}` - Get project by ID
- `PUT /api/v1/projects/{id}` - Update project
- `DELETE /api/v1/projects/{id}` - Delete project

### Agent Configuration
- `GET /api/v1/projects/{id}/agent-config` - Get agent configuration
- `PUT /api/v1/projects/{id}/agent-config` - Update agent configuration

More endpoints will be added as development progresses.
