#!/bin/bash

# ==============================================================================
# 🚀 project-runner.sh — One-click Start Script for AI Data Platform
# Chạy toàn bộ Project: Database, Backend, Airflow & Dashboard
# ==============================================================================

# Thiết lập màu sắc để hiển thị đẹp hơn
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BOLD}${BLUE}====================================================${NC}"
echo -e "${BOLD}${BLUE}   🌟 AI DATA PLATFORM — INITIALIZING SERVICES 🌟   ${NC}"
echo -e "${BOLD}${BLUE}====================================================${NC}"

# 1. Kiểm tra Docker
echo -e "\n${BOLD}[1/5] Kiểm tra Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Lỗi: Docker chưa chạy hoặc chưa được cài đặt.${NC}"
    echo -e "Vui lòng khởi động Docker Desktop và thử lại."
    exit 1
fi
echo -e "${GREEN}✅ Docker đang hoạt động.${NC}"

# 2. Kiểm tra File cấu hình (.env)
echo -e "\n${BOLD}[2/5] Kiểm tra cấu hình môi trường...${NC}"
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        echo -e "${YELLOW}⚠️  Không tìm thấy backend/.env. Đang copy từ .env.example...${NC}"
        cp backend/.env.example backend/.env
        echo -e "${YELLOW}👉 Lưu ý: Bạn nên mở backend/.env để thêm OPENAI_API_KEY nếu muốn dùng Chatbot.${NC}"
    else
        echo -e "${RED}❌ Lỗi: Không tìm thấy file .env.example trong thư mục backend/!${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ File .env đã sẵn sàng.${NC}"
fi

# 3. Khởi động Docker Compose
echo -e "\n${BOLD}[3/5] Đang khởi động các dịch vụ (Docker Compose)...${NC}"
echo -e "${BLUE}ℹ️  Quá trình này có thể mất vài phút trong lần đầu chạy (Build & Download Image).${NC}"

docker-compose up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Lỗi: Không thể khởi động Docker Compose. Vui lòng kiểm tra log lỗi bên trên.${NC}"
    exit 1
fi

# 4. Chờ dịch vụ sẵn sàng
echo -e "\n${BOLD}[4/5] Đang đợi Database & Backend sẵn sàng...${NC}"
MAX_RETRIES=30
COUNT=0

while [ $COUNT -lt $MAX_RETRIES ]; do
    # Kiểm tra Backend Health
    if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✅ Hệ thống đã sẵn sàng kết nối!${NC}"
        break
    fi
    echo -n "."
    sleep 3
    COUNT=$((COUNT + 1))
done

if [ $COUNT -eq $MAX_RETRIES ]; then
    echo -e "${YELLOW}⚠️  Lưu ý: Hệ thống mất nhiều thời gian hơn dự kiến để khởi động.${NC}"
    echo -e "Bạn có thể kiểm tra logs bằng lệnh: ${BOLD}docker-compose logs -f${NC}"
fi

# 5. Kích hoạt Airflow DAG
echo -e "\n${BOLD}[5/5] Đang cấu hình Airflow DAG...${NC}"
# Tự động unpause các DAG quan trọng để hệ thống chạy luôn
docker exec stock_airflow airflow dags unpause crypto_etl > /dev/null 2>&1
docker exec stock_airflow airflow dags unpause stock_etl > /dev/null 2>&1
echo -e "${GREEN}✅ Các tiến trình tự động (DAGs) đã được kích hoạt.${NC}"

# ==============================================================================
# TỔNG KẾT & LINKS
# ==============================================================================
echo -e "\n${BOLD}${BLUE}====================================================${NC}"
echo -e "${BOLD}${GREEN}        🚀 DỰ ÁN ĐÃ KHỞI CHẠY THÀNH CÔNG!          ${NC}"
echo -e "${BOLD}${BLUE}====================================================${NC}"
echo -e "\nBạn có thể truy cập các địa chỉ sau:"
echo -e ""
echo -e "  🌐 ${BOLD}Dashboard:${NC}     http://localhost:3000"
echo -e "  🤖 ${BOLD}AI Chatbot:${NC}    http://localhost:3000/chatbot.html"
echo -e "  ⚙️  ${BOLD}Airflow:${NC}       http://localhost:8080  (Admin / airflow)"
echo -e "  🗃️  ${BOLD}pgAdmin:${NC}       http://localhost:5050  (admin@stock.local / admin123)"
echo -e "  🏥 ${BOLD}Health Check:${NC}  http://localhost:3000/health"
echo -e ""
echo -e "${BLUE}Dùng lệnh này để xem log: ${BOLD}docker-compose logs -f${NC}"
echo -e "${RED}Dùng lệnh này để dừng:    ${BOLD}docker-compose down${NC}"
echo -e "${BLUE}====================================================${NC}\n"

# Mở trình duyệt dashboard nếu là macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    read -p "Bạn có muốn mở Dashboard ngay không? (y/n): " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        open http://localhost:3000
    fi
fi
