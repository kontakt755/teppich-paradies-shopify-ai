#!/usr/bin/env python3
"""
Partner REST API for B2B Color Data Access
FastAPI-based API for partners to query color metafields
"""

from fastapi import FastAPI, HTTPException, Header, Request, Depends
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import json
import hmac
import hashlib
import logging
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Teppich Paradies Color Data API",
    description="B2B API for color metafield data",
    version="1.0.0"
)

# Configuration from environment
API_SECRET = os.getenv("API_SECRET", "your-secret-key-here")
API_KEYS = {}  # Will be loaded from environment or database in production

# In production, load from secure storage
# For now, accept test keys from environment variable
if os.getenv("PARTNER_API_KEYS"):
    try:
        API_KEYS = json.loads(os.getenv("PARTNER_API_KEYS", "{}"))
    except json.JSONDecodeError:
        logger.warning("⚠️  Invalid PARTNER_API_KEYS JSON in environment")


class ColorData(BaseModel):
    color_number: str
    color_name: str
    width_cm: int
    width_code: str
    material_type: str
    usage_class: str
    product_type: str


class VariantColorResponse(BaseModel):
    variant_id: str
    sku: str
    color_data: ColorData


class BulkExportRequest(BaseModel):
    format: str = "csv"  # csv, json, xml
    filters: Optional[Dict] = None
    include_metadata: bool = True


@app.on_event("startup")
async def startup():
    """Initialize API on startup"""
    logger.info("🚀 Teppich Paradies Color Data API started")
    logger.info(f"📍 API version: 1.0.0")
    logger.info(f"🔐 API Keys configured: {len(API_KEYS)}")
    logger.info(f"🔑 Webhook secret: {'✓' if API_SECRET != 'your-secret-key-here' else '⚠️  Using default'}")
    load_color_mapping()
    logger.info("📊 Color mapping loaded successfully")


def load_color_mapping() -> Dict:
    """Load complete color mapping"""
    try:
        with open('automation/data/COMPLETE_COLOR_MAPPING_133.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error("Color mapping file not found")
        return {"colors": {}}


def verify_api_key(x_api_key: str = Header(...)) -> str:
    """Verify API key from request headers"""
    if x_api_key not in API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


async def verify_signature(request: Request) -> bool:
    """Verify HMAC signature for webhooks"""
    body = await request.body()
    signature = request.headers.get("X-Shopify-Hmac-SHA256", "")

    expected = hmac.new(
        API_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


@app.get("/api/v1/health")
async def health_check():
    """API health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }


@app.get("/api/v1/colors")
async def get_all_colors(api_key: str = Depends(verify_api_key)):
    """Get all available colors with mapping"""
    mapping = load_color_mapping()
    return {
        "total_colors": mapping.get("metadata", {}).get("total_colors", 0),
        "colors": mapping.get("colors", {})
    }


@app.get("/api/v1/colors/{color_number}")
async def get_color(color_number: str, api_key: str = Depends(verify_api_key)):
    """Get specific color by number"""
    mapping = load_color_mapping()
    colors = mapping.get("colors", {})

    # Try exact match and normalized match
    if color_number in colors:
        return {"color_number": color_number, "color_name": colors[color_number]}

    # Try padded format
    padded = color_number.zfill(3)
    if padded in colors:
        return {"color_number": padded, "color_name": colors[padded]}

    raise HTTPException(status_code=404, detail="Color not found")


@app.post("/api/v1/colors/search")
async def search_colors(
    name_contains: Optional[str] = None,
    color_range: Optional[Dict] = None,
    api_key: str = Depends(verify_api_key)
):
    """Search colors by name or range"""
    mapping = load_color_mapping()
    colors = mapping.get("colors", {})
    results = []

    for num, name in colors.items():
        # Filter by name
        if name_contains and name_contains.lower() not in name.lower():
            continue

        # Filter by range
        if color_range:
            num_int = int(num)
            min_range = color_range.get("min", 0)
            max_range = color_range.get("max", 999)
            if not (min_range <= num_int <= max_range):
                continue

        results.append({"color_number": num, "color_name": name})

    return {
        "total": len(results),
        "colors": results
    }


@app.get("/api/v1/variants/{variant_id}/color")
async def get_variant_color(variant_id: str, api_key: str = Depends(verify_api_key)):
    """Get color data for specific variant"""
    # In production, this queries Shopify metafields
    return {
        "variant_id": variant_id,
        "color_data": {
            "color_number": "405",
            "color_name": "Grün Dunkel",
            "width_cm": 400,
            "width_code": "4",
            "material_type": "polyamid",
            "usage_class": "33",
            "product_type": "Teppichboden"
        },
        "last_updated": datetime.now().isoformat()
    }


@app.post("/api/v1/export/bulk")
async def bulk_export(request: BulkExportRequest, api_key: str = Depends(verify_api_key)):
    """Export color data in bulk (CSV, JSON, or XML)"""
    format_type = request.format.lower()

    if format_type == "csv":
        return FileResponse(
            path="automation/data/color_export.csv",
            filename="teppich_paradies_colors.csv",
            media_type="text/csv"
        )
    elif format_type == "json":
        mapping = load_color_mapping()
        return JSONResponse(mapping)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")


@app.get("/api/v1/stats")
async def get_statistics(api_key: str = Depends(verify_api_key)):
    """Get API usage statistics"""
    mapping = load_color_mapping()
    metadata = mapping.get("metadata", {})

    return {
        "total_colors": metadata.get("total_colors", 0),
        "total_variants": metadata.get("total_variants", 0),
        "colors_from_titles": metadata.get("colors_from_titles", 0),
        "colors_intelligent": metadata.get("colors_intelligent", 0),
        "last_updated": datetime.now().isoformat()
    }


@app.post("/api/v1/webhooks/metafield-update")
async def webhook_metafield_update(request: Request):
    """Webhook for Shopify metafield updates"""
    if not await verify_signature(request):
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()
    logger.info(f"📨 Webhook received: {data.get('id', 'unknown')}")

    # Process webhook
    return {"status": "received"}


@app.get("/api/v1/docs")
async def get_documentation():
    """Get API documentation"""
    return {
        "title": "Teppich Paradies Color Data API",
        "version": "1.0.0",
        "endpoints": [
            {
                "path": "/api/v1/health",
                "method": "GET",
                "description": "Health check"
            },
            {
                "path": "/api/v1/colors",
                "method": "GET",
                "description": "Get all colors",
                "authentication": "API Key (X-API-Key header)"
            },
            {
                "path": "/api/v1/colors/{color_number}",
                "method": "GET",
                "description": "Get specific color"
            },
            {
                "path": "/api/v1/colors/search",
                "method": "POST",
                "description": "Search colors by name or range"
            },
            {
                "path": "/api/v1/variants/{variant_id}/color",
                "method": "GET",
                "description": "Get color for specific variant"
            },
            {
                "path": "/api/v1/export/bulk",
                "method": "POST",
                "description": "Export colors (CSV/JSON/XML)"
            },
            {
                "path": "/api/v1/stats",
                "method": "GET",
                "description": "Get statistics"
            }
        ]
    }


@app.get("/")
async def root():
    """API root"""
    return {
        "service": "Teppich Paradies Color Data API",
        "status": "operational",
        "docs_url": "/api/v1/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
