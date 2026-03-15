#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
BUNDLE_NAME="logging_deploy_bundle_${TIMESTAMP}"
BUNDLES_DIR="${ROOT_DIR}/deploy/bundles"
BUNDLE_DIR="${BUNDLES_DIR}/${BUNDLE_NAME}"
ARCHIVE_PATH="${BUNDLES_DIR}/${BUNDLE_NAME}.tar.gz"

FILES=(
  "docs/LOGGING_DEPLOY_RUNBOOK.md"
  "docs/LOGGING_SCHEMA.md"
  "docs/LOGGING_SMOKE_TEST_CHECKLIST.md"
  "n8n/regulation_search_dispatcher.json"
)

DIRS=(
  "deploy/beget"
  "site"
)

mkdir -p "${BUNDLE_DIR}"

copy_file() {
  local relative_path="$1"
  mkdir -p "${BUNDLE_DIR}/$(dirname "${relative_path}")"
  cp "${ROOT_DIR}/${relative_path}" "${BUNDLE_DIR}/${relative_path}"
}

copy_dir() {
  local relative_path="$1"
  mkdir -p "${BUNDLE_DIR}/$(dirname "${relative_path}")"
  cp -R "${ROOT_DIR}/${relative_path}" "${BUNDLE_DIR}/${relative_path}"
}

for file_path in "${FILES[@]}"; do
  copy_file "${file_path}"
done

for dir_path in "${DIRS[@]}"; do
  copy_dir "${dir_path}"
done

# Drop Finder metadata from the handoff archive while keeping useful dotfiles like .htaccess.
find "${BUNDLE_DIR}" -name '.DS_Store' -delete

BRANCH_NAME="$(git -C "${ROOT_DIR}" branch --show-current 2>/dev/null || true)"
COMMIT_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || true)"
GIT_STATUS="$(git -C "${ROOT_DIR}" status --short 2>/dev/null || true)"

cat > "${BUNDLE_DIR}/DEPLOY_MANIFEST.md" <<EOF
# Logging Deploy Bundle

- Created at (UTC): ${TIMESTAMP}
- Source repository: $(basename "${ROOT_DIR}")
- Git branch: ${BRANCH_NAME:-unknown}
- Git commit: ${COMMIT_SHA:-unknown}

## Included Paths

- \`site/\`
- \`deploy/beget/\`
- \`n8n/regulation_search_dispatcher.json\`
- \`docs/LOGGING_DEPLOY_RUNBOOK.md\`
- \`docs/LOGGING_SCHEMA.md\`
- \`docs/LOGGING_SMOKE_TEST_CHECKLIST.md\`

## Operator Flow

1. Import \`n8n/regulation_search_dispatcher.json\` into production n8n.
2. Deploy the bundled \`site/\` directory to production web root.
3. Follow \`docs/LOGGING_DEPLOY_RUNBOOK.md\` for activation details.
4. Run \`docs/LOGGING_SMOKE_TEST_CHECKLIST.md\` after deployment.

## Git Status At Bundle Time

\`\`\`text
${GIT_STATUS:-clean}
\`\`\`
EOF

tar -czf "${ARCHIVE_PATH}" -C "${BUNDLES_DIR}" "${BUNDLE_NAME}"

printf 'Bundle directory: %s\n' "${BUNDLE_DIR}"
printf 'Bundle archive: %s\n' "${ARCHIVE_PATH}"
