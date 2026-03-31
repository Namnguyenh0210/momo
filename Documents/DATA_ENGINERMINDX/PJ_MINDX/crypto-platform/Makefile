# AI Stock Assistant — Makefile
# Sử dụng: make <command>

.PHONY: help setup docker-up docker-down etl install dev

# Colors
BOLD  := $(shell tput bold)
RESET := $(shell tput sgr0)
GREEN := $(shell tput setaf 2)
BLUE  := $(shell tput setaf 4)

help: ## Hiển thị tất cả lệnh
	@echo "$(BOLD)$(BLUE)🚀 AI Stock Assistant$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2}'

# =============================================
# DOCKER
# =============================================
docker-up: ## Khởi động toàn bộ (PostgreSQL + pgAdmin + Backend + Airflow)
	@echo "$(BLUE)🐳 Starting all Docker services...$(RESET)"
	docker-compose up -d
	@echo "$(GREEN)✅ Services started!$(RESET)"
	@echo "   PostgreSQL: localhost:5454"
	@echo "   pgAdmin:    http://localhost:5050"
	@echo "   Backend:    http://localhost:3000"
	@echo "   Airflow:    http://localhost:8080  (ID/Pass: admin / airflow)"

docker-down: ## Dừng tất cả services
	docker-compose down

docker-logs: ## Xem logs
	docker-compose logs -f

docker-reset: ## Reset toàn bộ (xóa volumes)
	docker-compose down -v
	@echo "$(GREEN)✅ All data cleared$(RESET)"

# =============================================
# AIRFLOW
# =============================================
airflow-up: ## Khởi động riêng Airflow
	docker-compose up -d airflow
	@echo "$(GREEN)✅ Airflow started: http://localhost:8080$(RESET)"

airflow-logs: ## Xem logs Airflow
	docker-compose logs -f airflow

# =============================================
# DATABASE
# =============================================
setup-db: ## Tạo DB schema (Dùng docker container)
	@echo "$(BLUE)🗃️  Setting up database (via Docker)...$(RESET)"
	docker exec -i stock_postgres psql -U postgres -d stock_db < database/schema.sql
	@echo "$(GREEN)✅ Database schema created!$(RESET)"

# =============================================
# ETL
# =============================================
install-etl: ## Cài Python dependencies (Local)
	pip install -r etl/requirements.txt

etl: ## Chạy ETL pipeline một lần (Local)
	@echo "$(BLUE)🔄 Running Stock ETL pipeline...$(RESET)"
	cd etl && python pipeline.py

# =============================================
# BACKEND
# =============================================
install: ## Cài Node.js dependencies
	cd backend && npm install

dev: ## Chạy backend dev mode (Local)
	@echo "$(BLUE)🚀 Starting backend...$(RESET)"
	cd backend && npm run dev

start: ## Chạy backend production mode
	cd backend && npm start

# =============================================
# FULL SETUP (First time)
# =============================================
init: ## Full setup lần đầu
	@echo "$(BOLD)$(BLUE)🎯 AI Stock Assistant Initialization...$(RESET)"
	@echo ""
	@echo "1️⃣  Copying .env..."
	cp -n backend/.env.example backend/.env || true
	@echo "2️⃣  Installing Node.js deps..."
	cd backend && npm install
	@echo "3️⃣  Starting Docker Services..."
	docker-compose up -d
	@echo ""
	@echo "$(GREEN)$(BOLD)✅ Init complete!$(RESET)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Edit backend/.env — thêm OPENAI_API_KEY"
	@echo "  2. Restart: make docker-up"
	@echo "  3. Open Dashboard: http://localhost:3000"
	@echo "  4. Open Airflow:    http://localhost:8080"
