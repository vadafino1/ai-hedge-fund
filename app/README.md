# Web Application
The AI Hedge Fund app is a complete system with both frontend and backend components that enables you to run an AI-powered hedge fund trading system through a web interface on your own computer.

<img width="1721" alt="Screenshot 2025-06-28 at 6 41 03 PM" src="https://github.com/user-attachments/assets/b95ab696-c9f4-416c-9ad1-51feb1f5374b" />


## Overview

The AI Hedge Fund consists of:

- **Backend**: A FastAPI application that provides a REST API to run the hedge fund trading system and backtester
- **Frontend**: A React/Vite application that offers a user-friendly interface to visualize and control the hedge fund operations

## Table of Contents

- [🚀 Quick Start (For Non-Technical Users)](#-quick-start-for-non-technical-users)
  - [Option 1: Using 1-Line Shell Script (Recommended)](#option-1-using-1-line-shell-script-recommended)
  - [Option 2: Using npm (Alternative)](#option-2-using-npm-alternative)
- [🛠️ Manual Setup (For Developers)](#️-manual-setup-for-developers)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Detailed Documentation](#detailed-documentation)
- [Disclaimer](#disclaimer)
- [Troubleshooting](#troubleshooting])

## 🚀 Quick Start (For Non-Technical Users)

**One-line setup and run command:**

### Option 1: Using 1-Line Shell Script (Recommended)

#### For Mac/Linux:
```bash
./run.sh
```

If you get a "permission denied" error, run this first:
```bash
chmod +x run.sh && ./run.sh
```

Or alternatively, you can run:
```bash
bash run.sh
```

#### For Windows:
```cmd
run.bat
```

### Option 2: Using npm (Alternative)
```bash
cd app && npm install && npm run setup
```

**That's it!** These scripts will:
1. Check for required dependencies (Node.js, Python, Poetry)
2. Install all dependencies automatically
3. Start both frontend and backend services
4. **Automatically open your web browser** to the application

**Requirements:**
- [Node.js](https://nodejs.org/) (includes npm)
- [Python 3](https://python.org/)
- [Poetry](https://python-poetry.org/)

**After running, you can access:**
- Frontend (Web Interface): http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

---

## 🛠️ Manual Setup (For Developers)

If you prefer to set up each component manually or need more control:

### Prerequisites

- Node.js and npm for the frontend
- Python 3.8+ and Poetry for the backend

### Installation

1. Clone the repository:
```bash
git clone https://github.com/virattt/ai-hedge-fund.git
cd ai-hedge-fund
```

2. Set up your environment variables:
```bash
# Create .env file for your API keys (in the root directory)
cp .env.example .env
```

3. Edit the .env file to add your API keys:
```bash
# For running LLMs hosted by openai (gpt-4o, gpt-4o-mini, etc.)
OPENAI_API_KEY=your-openai-api-key

# For running LLMs hosted by groq (deepseek, llama3, etc.)
GROQ_API_KEY=your-groq-api-key

# For getting financial data to power the hedge fund
FINANCIAL_DATASETS_API_KEY=your-financial-datasets-api-key
```

4. Install Poetry (if not already installed):
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

5. Install root project dependencies:
```bash
# From the root directory
poetry install
```

6. Install backend app dependencies:
```bash
# Navigate to the backend directory
cd app/backend
pip install -r requirements.txt  # If there's a requirements.txt file
# OR
poetry install  # If there's a pyproject.toml in the backend directory
```

7. Install frontend app dependencies:
```bash
cd app/frontend
npm install  # or pnpm install or yarn install
```

### Running the Application

1. Start the backend server:
```bash
# In one terminal, from the backend directory
cd app/backend
poetry run uvicorn main:app --reload
```

2. Start the frontend application:
```bash
# In another terminal, from the frontend directory
cd app/frontend
npm run dev
```

You can now access:
- Frontend application: http://localhost:5173
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Detailed Documentation

For more detailed information:
- [Backend Documentation](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)

## Disclaimer

This project is for **educational and research purposes only**.

- Not intended for real trading or investment
- No warranties or guarantees provided
- Creator assumes no liability for financial losses
- Consult a financial advisor for investment decisions

By using this software, you agree to use it solely for learning purposes.

## Troubleshooting

### Common Issues

#### "Command not found: uvicorn" Error
If you see this error when running the setup script:

```bash
[ERROR] Backend failed to start. Check the logs:
Command not found: uvicorn
```

**Solution:**
1. **Clean Poetry environment:**
   ```bash
   cd app/backend
   poetry env remove --all
   poetry install
   ```

2. **Or force reinstall:**
   ```bash
   cd app/backend
   poetry install --sync
   ```

3. **Verify installation:**
   ```bash
   cd app/backend
   poetry run python -c "import uvicorn; import fastapi"
   ```

#### Python Version Issues
- **Use Python 3.11**: Python 3.13+ may have compatibility issues
- **Check your Python version:** `python --version`
- **Switch Python versions if needed** (using pyenv, conda, etc.)

#### Environment Variable Issues
- **Ensure .env file exists** in the project root directory
- **Copy from template:** `cp .env.example .env`
- **Add your API keys** to the .env file

#### Permission Issues (Mac/Linux)
If you get "permission denied":
```bash
chmod +x run.sh
./run.sh
```

#### Port Already in Use
If ports 8000 or 5173 are in use:
- **Kill existing processes:** `pkill -f "uvicorn\|vite"`
- **Or use different ports** by modifying the scripts

### Getting Help
- Check the [GitHub Issues](https://github.com/virattt/ai-hedge-fund/issues)
- Follow updates on [Twitter](https://x.com/virattt) 


## Docker sandbox execution mode

The web app can optionally run hedge-fund and backtest requests in a short-lived local Docker container instead of inside the FastAPI backend process. Local execution remains the default. This is local Docker isolation only; it is not a trading guarantee, a remote sandbox, or a multi-tenant security boundary.

Build the image before enabling sandbox mode:

```bash
docker build -f docker/Dockerfile -t ai-hedge-fund:latest .
```

Then start the app normally from the `app` directory:

```bash
cd app
./run.sh
```

Check availability at `GET http://localhost:8000/sandbox/status` or in Settings -> Sandbox. Configure with these optional environment variables in the root `.env` file:

```bash
AI_HEDGE_FUND_EXECUTION_MODE=local
AI_HEDGE_FUND_SANDBOX_IMAGE=ai-hedge-fund:latest
AI_HEDGE_FUND_SANDBOX_NETWORK=bridge
AI_HEDGE_FUND_SANDBOX_TIMEOUT_SECONDS=900
AI_HEDGE_FUND_SANDBOX_RETAIN_RUN_DIRS=false
```

The sandbox runner bind-mounts request files and, if present, the root `.env` file read-only. It does not use `--env-file`, and tests are designed so default unit tests do not require Docker. If source code changes, rebuild the Docker image before expecting sandbox runs to reflect those changes.


## Data providers for daily/weekly trading

FinancialDatasets is optional premium mode, not a prerequisite. The default data mode is suitable for daily/weekly backtesting: local daily quote files under `data/prices` first, then free daily providers where available. Local CSV files should contain `date,open,high,low,close,volume` columns.

Fintel can be enabled as optional enrichment for institutional ownership, insider trades, short data, filings, institution holdings, and filing/document search. Fintel is not used as the primary OHLCV price source.

```bash
AI_HEDGE_FUND_DATA_PROVIDER=local,yfinance
AI_HEDGE_FUND_PRICE_DATA_DIR=data/prices
AI_HEDGE_FUND_ENABLE_FINTEL=false
AI_HEDGE_FUND_FINTEL_PROVIDER_PATH=
AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS=false
# Optional premium mode only:
# FINANCIAL_DATASETS_API_KEY=your-financialdatasets-key
```
