#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION_NAME="pong"
REGION="${AWS_DEFAULT_REGION:-ca-central-1}"
ENDPOINT="${FLOCI_ORIGIN:-http://localhost:4566}"
ZIP_PATH="$ROOT_DIR/lambdas/pong/function.zip"
SRC_PATH="$ROOT_DIR/lambdas/pong/index.js"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN:-test}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required"
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required"
  exit 1
fi

if [ ! -f "$SRC_PATH" ]; then
  echo "Lambda source not found: $SRC_PATH"
  exit 1
fi

cd "$ROOT_DIR/lambdas/pong"
rm -f "$ZIP_PATH"
zip -q function.zip index.js

if aws --endpoint-url "$ENDPOINT" --region "$REGION" lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "Updating existing Lambda: $FUNCTION_NAME"
  aws --endpoint-url "$ENDPOINT" --region "$REGION" lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" >/dev/null
else
  echo "Creating Lambda: $FUNCTION_NAME"
  aws --endpoint-url "$ENDPOINT" --region "$REGION" lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs18.x \
    --handler index.handler \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --zip-file "fileb://$ZIP_PATH" >/dev/null
fi

echo "Invoking Lambda: $FUNCTION_NAME"
RESULT_FILE="$ROOT_DIR/lambdas/pong/invoke-result.json"
aws --endpoint-url "$ENDPOINT" --region "$REGION" lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"ping":true}' \
  "$RESULT_FILE" >/dev/null

echo "Done. Result written to: $RESULT_FILE"
cat "$RESULT_FILE"
