import protectedRouteFactory from './rules/protected-route-factory';

const plugin = {
  meta: {
    name: '@celebbase/eslint-plugin-celebbase',
    version: '0.0.0',
  },
  rules: {
    'protected-route-factory': protectedRouteFactory,
  },
};

export default plugin;
export { protectedRouteFactory };
