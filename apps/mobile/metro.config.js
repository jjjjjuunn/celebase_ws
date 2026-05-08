// Metro bundler config for pnpm monorepo.
// Reference: https://docs.expo.dev/guides/monorepos/
//
// pnpm 의 hoist 패턴 + per-package node_modules 둘 다 검색하기 위해
// `nodeModulesPaths` 와 `watchFolders` 를 root 까지 확장한다.
//
// (옵션) `resolver.resolveRequest` 로 service-core / ui-kit import 차단은
// Plan v5 §M0 의 동료 작업. 현재 ESLint `no-restricted-imports` 가
// CHORE-MOBILE-001 (PR #47) 에서 동일 가드를 IDE 레벨로 제공하므로 본
// scaffold 에서는 생략. 동료 M0 진행 시 fail-fast Metro 차단 추가 가능.

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

// 3) Disable hierarchical lookup — pnpm 모노레포에서는 정확한 nodeModulesPaths
//    경로만 사용해야 cross-package import 가 안전하게 차단된다.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
