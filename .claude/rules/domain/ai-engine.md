---
paths:
  - "services/ai-engine/**/*"
  - "services/meal-plan-engine/**/*"
  - "**/*nutrition*"
  - "**/*macro*"
---
# AI Engine Rules

## 안전 장치 (Nutrition Bounds)

```python
NUTRITION_BOUNDS = {
    "min_daily_kcal": 1200,
    "max_daily_kcal": 5000,
    "min_protein_g_per_kg": 0.8,
    "max_protein_g_per_kg": 3.0,
    "min_fat_pct": 15,
    "max_fat_pct": 60,
    "min_carb_g": 50,
}

NUTRITION_TOLERANCE = {
    "protein_variance_pct": 5,        # USDA vs Instacart 편차 허용
    "calorie_drift_warning_pct": 10,  # 일일 칼로리 합산 오차 경고
    "micro_unit_mismatch": "BLOCK",   # IU/ug 혼동 즉시 차단
}
```

- 범위 이탈 시 bounds에 클램핑 + 사용자에게 조정 사유 표시.
- 알레르기: 대체 재료 불가 시 레시피 통째로 교체. 알레르겐 포함 레시피 제공 절대 금지.
- GLP-1 모드: 단백질 최소 체중 x 2.0g 강제.

## PHI 최소화

- 각 파이프라인 단계는 `phi_minimizer.py`로 필요 최소 건강 데이터만 수신.
- 전체 `bio_profiles` 객체 통째로 전달 금지 (spec.md § 5.7 참조).

## 영양 데이터 표준화

- 이종 소스(USDA, Instacart, 수동)는 `nutrition_normalizer`로 공통 스키마 변환 후 사용.
- 원시 데이터 직접 계산 금지 (spec.md § 5.5 참조).

## 웨어러블 데이터 (Phase 2+)

- 6시간 이상 미동기화 시 해당 데이터 불신 → 보수적 기본값 (activity_level 1단계 하향).
- UI에 "건강 데이터 동기화 필요" 배지 표시.

## 필수 테스트 시나리오

모든 AI Engine 변경 시 통과 필수:

1. **기본 생성**: 건강한 30대 남성, moderate, Ronaldo → 합리적 매크로
2. **알레르기 대체**: 유제품+글루텐 알레르기, Paltrow → 알레르겐 0건
3. **극단적 감량**: BMI 35+, weight_loss → 칼로리 >= 1200kcal
4. **고활동량**: very active + muscle_gain → 단백질 >= 체중 x 2.0g
5. **GLP-1 모드**: GLP-1 사용자 → 단백질 >= 체중 x 2.0g, 칼로리 10% deficit
6. **비건 단백질**: 비건 + 고단백 → 식물성만으로 충족 확인
7. **7일 다양성**: 동일 레시피 3회 이상 반복 없음
8. **영양소 단위 검증**: USDA + Instacart 혼합 시 단위 변환 정확성
9. **PHI 최소화**: 각 단계에서 불필요 건강 필드 미전달 확인
