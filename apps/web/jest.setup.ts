process.env['JWKS_URI'] = 'https://mock-cognito.example.com/.well-known/jwks.json';
process.env['JWT_ISSUER'] = 'https://mock-cognito.example.com';
process.env['JWT_AUDIENCE'] = 'test-audience';
process.env['USER_SERVICE_URL'] = 'http://localhost:3001';
process.env['CONTENT_SERVICE_URL'] = 'http://localhost:3002';
process.env['MEAL_PLAN_URL'] = 'http://localhost:3003';
process.env['LOG_LEVEL'] = 'silent';
