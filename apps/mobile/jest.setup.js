// jest setupFiles — test environment 초기화 직후, 각 test 파일의 import 보다
// 먼저 실행된다.
//
// 목적: App.tsx 가 module load 시점에 configureCognito() 를 호출하므로 jest 가
// App 을 import 하기 전에 환경 변수가 채워져 있어야 한다. test 파일 안에서
// process.env 를 세팅하면 ES import hoisting 때문에 cognito 모듈 load 가
// 먼저 일어나 throw 발생. setupFiles 단계에 두면 import 보다 확실히 앞.
process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID = 'us-west-2_TEST';
process.env.EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID = 'test-client-id';
process.env.EXPO_PUBLIC_AWS_REGION = 'us-west-2';
