FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY ../data /data

ENV PYTHONUNBUFFERED=1
ENV API_PORT=8000

EXPOSE 8000

CMD ["uvicorn", "partner_rest_api:app", "--host", "0.0.0.0", "--port", "8000"]
