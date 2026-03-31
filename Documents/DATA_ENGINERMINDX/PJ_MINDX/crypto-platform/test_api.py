import requests
import os

ALPHA_VANTAGE_API_KEY = "CABVIHX9HPXRGYO2"
symbol = "AAPL"
url = f"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={symbol}&apikey={ALPHA_VANTAGE_API_KEY}"

resp = requests.get(url)
print(resp.json())
