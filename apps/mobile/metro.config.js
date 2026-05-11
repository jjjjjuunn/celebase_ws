// Metro bundler config for pnpm monorepo.
// Reference: https://docs.expo.dev/guides/monorepos/
//
// pnpm strict isolation (.pnpm/ 깊은 경로) + Metro 의 transitive autolinking
// 호환을 위해 unstable_enableSymlinks 활성화 + hierarchical lookup 허용.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1) Watch the entire monorepo so changes in packages/* / shared-types 가
//    Metro fast-refresh 에 반영된다.
config.watchFolders = [workspaceRoot];

// 2) Resolve modules from both per-package and root node_modules. pnpm 은
//    package 별 .pnpm 심볼릭 링크 + root hoist 를 둘 다 사용.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3) pnpm 의 .pnpm/ 안 symlink 를 Metro 가 따라가도록 활성화. SDK 51+ 에서
//    안정적. 이게 없으면 expo-modules-core 같은 transitive dep 이 isolated
//    경로 안에 갇혀 RCTFatal "could not be found" 발생.
config.resolver.unstable_enableSymlinks = true;

// 4) package.json 의 "exports" 필드를 Metro 가 사용하도록 활성화. SDK 51+
//    의 권장 설정 — 일부 modern packages (jose 등) 가 exports map 만 제공.
config.resolver.unstable_enablePackageExports = true;

// 5) Web-only / server-only workspace 패키지 import 차단 (fail-fast).
//    ESLint flat config (PR #47 CHORE-MOBILE-001) 가 IDE/CI 1차 방어이지만
//    ESLint 우회 빌드 시 뚫리므로 Metro resolver 단계에서 2차 방어.
//    - @celebbase/service-core: Node 전용 (Fastify, pg 등) — RN 번들 X
//    - @celebbase/ui-kit: react-dom + CSS Modules — RN 호환 X
//    대안: RN primitive 는 apps/mobile/src/components/ 에 새로 구현,
//          토큰은 packages/design-tokens 의 RN 익스포트 사용.
const BLOCKED_PACKAGES = ['@celebbase/service-core', '@celebbase/ui-kit'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const pkg of BLOCKED_PACKAGES) {
    if (moduleName === pkg || moduleName.startsWith(`${pkg}/`)) {
      throw new Error(
        `[apps/mobile] '${moduleName}' is server-only / web-only and cannot be bundled into RN. ` +
        `Use packages/design-tokens (RN export) or implement a RN primitive in apps/mobile/src/components/.`,
      );
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
