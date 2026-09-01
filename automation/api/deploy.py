#!/usr/bin/env python3
"""
Deployment helper for Shopify Admin API and Partner REST API
Validates configuration and starts both services
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def check_environment():
    """Verify all required environment variables"""
    required = [
        "SHOPIFY_SHOP_URL",
        "SHOPIFY_ACCESS_TOKEN",
    ]

    optional = [
        "SHOPIFY_API_VERSION",
        "API_SECRET",
        "API_PORT",
    ]

    print("\n" + "="*80)
    print("ENVIRONMENT VALIDATION")
    print("="*80)

    missing = []
    for var in required:
        value = os.getenv(var)
        if value:
            masked = value[:10] + "***" if len(value) > 10 else value
            print(f"✅ {var}: {masked}")
        else:
            print(f"❌ {var}: MISSING")
            missing.append(var)

    print("\nOptional Configuration:")
    for var in optional:
        value = os.getenv(var)
        if value:
            print(f"✅ {var}: {value}")
        else:
            print(f"⚠️  {var}: Not set (using default)")

    if missing:
        print("\n" + "="*80)
        print("CONFIGURATION ERROR")
        print("="*80)
        print(f"\nMissing {len(missing)} required environment variables:")
        for var in missing:
            print(f"  - {var}")

        print("\nSetup Instructions:")
        print("1. Copy .env.example to .env")
        print("   cp automation/api/.env.example automation/api/.env")
        print("\n2. Edit .env and add your Shopify credentials:")
        print("   SHOPIFY_SHOP_URL=https://your-store.myshopify.com")
        print("   SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx")
        print("\n3. Get your access token from Shopify Admin:")
        print("   - Apps and channels → App and sales channel settings")
        print("   - Create custom app (if needed)")
        print("   - Scopes: write_products, read_products, write_metafields, read_metafields")
        print("   - Copy access token")

        return False

    return True


def check_dependencies():
    """Verify Python dependencies"""
    print("\n" + "="*80)
    print("DEPENDENCY CHECK")
    print("="*80)

    required_packages = {
        "fastapi": "FastAPI",
        "uvicorn": "Uvicorn",
        "pydantic": "Pydantic",
        "requests": "Requests",
        "dotenv": "Python-dotenv",
    }

    missing = []
    for module, name in required_packages.items():
        try:
            __import__(module)
            print(f"✅ {name}")
        except ImportError:
            print(f"❌ {name}")
            missing.append(name)

    if missing:
        print(f"\nInstall missing packages:")
        print(f"  pip install -r automation/api/requirements.txt")
        return False

    return True


def check_admin_api():
    """Verify Admin API can initialize"""
    print("\n" + "="*80)
    print("ADMIN API VERIFICATION")
    print("="*80)

    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from shopify_admin_api import ShopifyAdminAPI

        api = ShopifyAdminAPI()
        print(f"✅ Connected to: {api.shop_url}")

        status = api.get_all_batches_status()
        print(f"✅ Batches loaded: {status['total_batches']}")
        print(f"✅ Total mutations: {status['total_mutations']}")

        return True

    except Exception as e:
        print(f"❌ Admin API initialization failed: {str(e)}")
        return False


def check_partner_api():
    """Verify Partner API can initialize"""
    print("\n" + "="*80)
    print("PARTNER REST API VERIFICATION")
    print("="*80)

    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from partner_rest_api import app

        print(f"✅ FastAPI app initialized: {app.title}")
        print(f"✅ Version: {app.version}")
        print(f"✅ Endpoints: {len(app.routes)}")

        return True

    except Exception as e:
        print(f"❌ Partner API initialization failed: {str(e)}")
        return False


def start_services():
    """Start both APIs"""
    print("\n" + "="*80)
    print("STARTING SERVICES")
    print("="*80)

    api_port = os.getenv("API_PORT", "8000")

    print(f"\n🚀 Starting Partner REST API on http://localhost:{api_port}")
    print(f"📚 Docs available at http://localhost:{api_port}/docs")
    print(f"\nPress Ctrl+C to stop\n")

    try:
        subprocess.run([
            "uvicorn",
            "partner_rest_api:app",
            "--host", "0.0.0.0",
            "--port", api_port,
            "--reload"
        ])
    except KeyboardInterrupt:
        print("\n\n✅ Services stopped")


def main():
    """Run all checks and start services"""
    print("\n" + "="*80)
    print("TEPPICH PARADIES - API DEPLOYMENT")
    print("="*80)

    checks = [
        ("Environment Configuration", check_environment),
        ("Dependencies", check_dependencies),
        ("Admin API", check_admin_api),
        ("Partner API", check_partner_api),
    ]

    results = []
    for name, check in checks:
        try:
            result = check()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ {name} check failed: {str(e)}")
            results.append((name, False))

    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)

    all_passed = all(result for _, result in results)
    for name, result in results:
        status = "✅" if result else "❌"
        print(f"{status} {name}")

    if all_passed:
        print("\n🎉 All checks passed! Ready to start services.\n")
        start_services()
    else:
        print("\n❌ Please fix the errors above before starting services.")
        sys.exit(1)


if __name__ == "__main__":
    main()
