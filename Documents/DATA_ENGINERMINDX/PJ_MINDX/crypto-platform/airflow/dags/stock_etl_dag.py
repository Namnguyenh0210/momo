"""
Airflow DAG - AI Stock Assistant Pipeline (Alpha Vantage)
Chạy hàng ngày để cập nhật giá cổ phiếu và tính toán chỉ số
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
import sys
import os

# Link folder etl để Airflow nhận diện module
ETL_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../etl"))
sys.path.insert(0, ETL_PATH)

from pipeline import run_medallion_etl

# Config DAG
default_args = {
    'owner': 'DataEngineer',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    'stock_assistant_etl_v1',
    default_args=default_args,
    description='Pipeline lấy dữ liệu Alpha Vantage hàng ngày',
    schedule_interval='0 10 * * 1-5', # Chạy lúc 10 AM (giờ VN) mỗi thứ 2-6 (ngày sàn chứng khoán mở)
    catchup=False,
    tags=['stock', 'alpha-vantage', 'ai'],
) as dag:

    def trigger_etl():
        """Bọc hàm pipeline với Medallion Architecture"""
        success = run_medallion_etl(mode="stock")
        if not success:
            raise Exception("Medallion Pipeline failed, xem logs chi tiết tại etl pipeline")

    run_etl_task = PythonOperator(
        task_id='daily_stock_etl_task',
        python_callable=trigger_etl,
    )

    run_etl_task
