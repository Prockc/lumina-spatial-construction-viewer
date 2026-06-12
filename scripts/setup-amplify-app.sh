#!/usr/bin/env bash
#
# One-time provisioning of the AWS Amplify Hosting app.
#
# Creates (or updates) an Amplify app named exactly
# "Lumina Spatial Construction Viewer", applies the SPA rewrite rules from
# amplify-rewrites.json, and sets the build-time environment variables.
#
# Prereqs: AWS CLI v2 authenticated with permissions for Amplify.
#
# Usage:
#   ./scripts/setup-amplify-app.sh <git-repo-url> <s3-bucket-url> [xgrids-app-key]
#
# Example:
#   ./scripts/setup-amplify-app.sh \
#     https://github.com/lumina-spatial/lumina-spatial-construction-viewer \
#     https://lumina-spatial-models.s3.us-east-1.amazonaws.com \
#     YOUR_XGRIDS_APP_KEY

set -euo pipefail

APP_NAME="Lumina Spatial Construction Viewer"
REPO_URL="${1:?Usage: setup-amplify-app.sh <git-repo-url> <s3-bucket-url> [xgrids-app-key]}"
S3_BUCKET_URL="${2:?Missing S3 bucket URL (e.g. https://my-bucket.s3.us-east-1.amazonaws.com)}"
XGRIDS_APP_KEY="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REWRITES_FILE="$SCRIPT_DIR/../amplify-rewrites.json"

ENV_VARS="VITE_S3_BUCKET_URL=$S3_BUCKET_URL"
if [[ -n "$XGRIDS_APP_KEY" ]]; then
  ENV_VARS="$ENV_VARS,VITE_XGRIDS_APP_KEY=$XGRIDS_APP_KEY"
fi

EXISTING_APP_ID=$(aws amplify list-apps \
  --query "apps[?name=='$APP_NAME'].appId | [0]" --output text)

if [[ "$EXISTING_APP_ID" == "None" || -z "$EXISTING_APP_ID" ]]; then
  echo "Creating Amplify app: $APP_NAME"
  APP_ID=$(aws amplify create-app \
    --name "$APP_NAME" \
    --repository "$REPO_URL" \
    --platform WEB \
    --custom-rules "file://$REWRITES_FILE" \
    --environment-variables "$ENV_VARS" \
    --enable-branch-auto-build \
    --query 'app.appId' --output text)
else
  APP_ID="$EXISTING_APP_ID"
  echo "Updating existing Amplify app: $APP_NAME ($APP_ID)"
  aws amplify update-app \
    --app-id "$APP_ID" \
    --custom-rules "file://$REWRITES_FILE" \
    --environment-variables "$ENV_VARS" >/dev/null
fi

if ! aws amplify get-branch --app-id "$APP_ID" --branch-name main >/dev/null 2>&1; then
  aws amplify create-branch --app-id "$APP_ID" --branch-name main >/dev/null
  echo "Created branch: main"
fi

echo
echo "Amplify app ready."
echo "  App ID:      $APP_ID"
echo "  Default URL: https://main.$APP_ID.amplifyapp.com"
echo
echo "Next steps:"
echo "  1. Connect the GitHub repo in the Amplify console (one-time OAuth) if not already linked."
echo "  2. Apply s3-cors-policy.json to the model bucket:"
echo "       aws s3api put-bucket-cors --bucket <bucket-name> --cors-configuration '{\"CORSRules\": '\"\$(cat s3-cors-policy.json)\"'}'"
echo "  3. Push to main to trigger the first build (amplify.yml drives it)."
