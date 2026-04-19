process.env['INTERNAL_JWT_SECRET'] = 'ci-dev-secret-not-for-prod';
process.env['INTERNAL_JWT_ISSUER'] = 'celebbase-user-service';
process.env['USER_SERVICE_URL'] = 'http://localhost:3001';
process.env['CONTENT_SERVICE_URL'] = 'http://localhost:3002';
process.env['MEAL_PLAN_URL'] = 'http://localhost:3003';
process.env['LOG_LEVEL'] = 'silent';
