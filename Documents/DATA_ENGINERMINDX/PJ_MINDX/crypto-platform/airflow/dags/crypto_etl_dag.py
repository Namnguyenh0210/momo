"""
Airflow DAG - Crypto Assistant Pipeline (Binance)
Chạy mỗi 5 phút để cập nhật giá Crypto
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
    'retry_delay': timedelta(minutes=1),
}

with DAG(
    'crypto_assistant_etl_v2',
    default_args=default_args,
    description='Pipeline lấy dữ liệu Binance Crypto (Mỗi 5 phút)',
    schedule_interval='*/5 * * * *', # Chạy mỗi 5 phút
    catchup=False,
    tags=['crypto', 'binance', 'ai', 'medallion'],
) as dag:

    def trigger_crypto_etl():
        """Bọc hàm pipeline với Medallion Architecture cho Crypto (Binance)"""
        # Gọi chính xác hàm run_medallion_etl nhưng với mode là "crypto"
        success = run_medallion_etl(mode="crypto")
        if not success:
            raise Exception("Medallion Crypto Pipeline failed, xem logs chi tiết tại etl pipeline")

    run_crypto_etl_task = PythonOperator(
        task_id='5min_crypto_etl_task',
        python_callable=trigger_crypto_etl,
    )

    run_crypto_etl_task
