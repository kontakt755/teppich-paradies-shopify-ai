#!/bin/bash
# Setup script for repository portability across Windows/Mac/Linux
# Configures git line endings and local settings for this repository

set -e

echo "🔧 Configuring git for cross-platform development..."
echo ""

# Configure line ending behavior for this repository
echo "Setting LF line endings (Unix-style)..."
git config core.eol lf
git config core.safecrlf warn
echo "✓ core.eol = lf"
echo "✓ core.safecrlf = warn"

# Ensure .gitattributes is respected
echo ""
echo "Verifying .gitattributes configuration..."
if [ ! -f .gitattributes ]; then
    echo "⚠ .gitattributes not found in repository root"
    exit 1
else
    echo "✓ .gitattributes found"
fi

# Verify .gitignore has critical patterns
echo ""
echo "Verifying .gitignore coverage..."
required_patterns=(".env" "node_modules" ".DS_Store" "__pycache__" ".idea" ".vscode")
missing=0
for pattern in "${required_patterns[@]}"; do
    if grep -q "$pattern" .gitignore; then
        echo "✓ $pattern"
    else
        echo "⚠ Missing: $pattern"
        missing=$((missing + 1))
    fi
done

if [ $missing -eq 0 ]; then
    echo "✓ All critical patterns present in .gitignore"
else
    echo "⚠ $missing patterns missing from .gitignore"
    exit 1
fi

echo ""
echo "✅ Repository portability configured successfully!"
echo ""
echo "Next steps:"
echo "1. Clone this repository on Windows/Mac/Linux"
echo "2. Run this script: bash git-setup-local.sh"
echo "3. All team members will have consistent line endings"
echo ""
