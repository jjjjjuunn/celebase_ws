'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '../../../../lib/fetcher.js';
import { TierGate } from '../../../../components/TierGate.js';
import { DisclaimerBanner } from '../../_components/DisclaimerBanner.js';
import styles from './recipe-detail.module.css';

type PersonalizedData = schemas.PersonalizedRecipeResponse['personalization'];

function PersonalizedSection({ recipeId }: { recipeId: string }): React.ReactElement | null {
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [data, setData] = useState<PersonalizedData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher(`/api/recipes/${encodeURIComponent(recipeId)}/personalized`, {
      schema: schemas.PersonalizedRecipeResponseSchema,
    })
      .then((res) => {
        if (!cancelled) {
          setData(res.personalization);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [recipeId]);

  if (status !== 'success' || data === null) {
    return null;
  }

  const { scaling_factor, adjusted_nutrition, adjusted_servings } = data;

  // Hide section when no real personalization — values would mirror the base
  // nutrition card and add no information for the user.
  if (Math.abs(scaling_factor - 1.0) < 0.01) {
    return null;
  }

  return (
    <div className={styles.personalizedSection} aria-labelledby="personalized-heading">
      <div className={styles.personalizedHeader}>
        <span className={styles.personalizedTag} aria-label="Premium feature">Premium</span>
        <h2 id="personalized-heading" className={styles.personalizedHeading}>
          Personalized for you
        </h2>
      </div>
      <div className={styles.scalingMeta}>
        <div className={styles.scalingItem}>
          <span className={styles.scalingValue}>{adjusted_servings}</span>
          <span className={styles.scalingLabel}>Your servings</span>
        </div>
        <div className={styles.scalingItem}>
          <span className={styles.scalingValue}>×{scaling_factor.toFixed(2)}</span>
          <span className={styles.scalingLabel}>Scaling factor</span>
        </div>
      </div>
      <div className={styles.personalizedNutritionGrid}>
        <div className={styles.nutrient}>
          <span className={styles.nutrientValue}>{String(adjusted_nutrition.calories)}</span>
          <span className={styles.nutrientLabel}>kcal</span>
        </div>
        <div className={styles.nutrient}>
          <span className={styles.nutrientValue}>{adjusted_nutrition.protein_g.toFixed(1)}g</span>
          <span className={styles.nutrientLabel}>Protein</span>
        </div>
        <div className={styles.nutrient}>
          <span className={styles.nutrientValue}>{adjusted_nutrition.carbs_g.toFixed(1)}g</span>
          <span className={styles.nutrientLabel}>Carbs</span>
        </div>
        <div className={styles.nutrient}>
          <span className={styles.nutrientValue}>{adjusted_nutrition.fat_g.toFixed(1)}g</span>
          <span className={styles.nutrientLabel}>Fat</span>
        </div>
      </div>
    </div>
  );
}

type Recipe = schemas.RecipeWire;

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function RecipeDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [loadStatus, setLoadStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher(`/api/recipes/${encodeURIComponent(id)}`, {
      schema: schemas.RecipeDetailResponseSchema,
    })
      .then((data) => {
        if (!cancelled) {
          setRecipe(data.recipe);
          setLoadStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadStatus === 'loading') {
    return (
      <div className={styles.page}>
        <Link href="/plans" className={styles.backLink}>← Plans</Link>
        <p className={styles.hint}>Loading…</p>
      </div>
    );
  }

  if (loadStatus === 'error' || recipe === null) {
    return (
      <div className={styles.page}>
        <Link href="/plans" className={styles.backLink}>← Plans</Link>
        <p role="alert" className={styles.errorText}>Recipe not found or failed to load.</p>
      </div>
    );
  }

  const totalTimeMin =
    (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0);

  return (
    <div className={styles.page}>
      <Link href="/plans" className={styles.backLink}>← Plans</Link>

      {recipe.image_url !== null && (
        <div className={styles.imageWrapper}>
          <img src={recipe.image_url} alt={recipe.title} className={styles.image} />
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.tag}>
            {MEAL_TYPE_LABEL[recipe.meal_type] ?? recipe.meal_type}
          </span>
          {recipe.difficulty !== null && (
            <span className={styles.tag}>
              {DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}
            </span>
          )}
        </div>
        <h1 className={styles.title}>{recipe.title}</h1>
        {recipe.description !== null && (
          <p className={styles.description}>{recipe.description}</p>
        )}
      </div>

      <div className={styles.statsRow}>
        {recipe.prep_time_min !== null && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{String(recipe.prep_time_min)} min</span>
            <span className={styles.statLabel}>Prep</span>
          </div>
        )}
        {recipe.cook_time_min !== null && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{String(recipe.cook_time_min)} min</span>
            <span className={styles.statLabel}>Cook</span>
          </div>
        )}
        {totalTimeMin > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{String(totalTimeMin)} min</span>
            <span className={styles.statLabel}>Total</span>
          </div>
        )}
        <div className={styles.stat}>
          <span className={styles.statValue}>{String(recipe.servings)}</span>
          <span className={styles.statLabel}>Servings</span>
        </div>
      </div>

      <section className={styles.nutritionSection} aria-labelledby="nutrition-heading">
        <h2 id="nutrition-heading" className={styles.sectionHeading}>Nutrition per serving</h2>
        <div className={styles.nutritionGrid}>
          <div className={styles.nutrient}>
            <span className={styles.nutrientValue}>{String(recipe.nutrition.calories)}</span>
            <span className={styles.nutrientLabel}>kcal</span>
          </div>
          <div className={styles.nutrient}>
            <span className={styles.nutrientValue}>{String(recipe.nutrition.protein_g)}g</span>
            <span className={styles.nutrientLabel}>Protein</span>
          </div>
          <div className={styles.nutrient}>
            <span className={styles.nutrientValue}>{String(recipe.nutrition.carbs_g)}g</span>
            <span className={styles.nutrientLabel}>Carbs</span>
          </div>
          <div className={styles.nutrient}>
            <span className={styles.nutrientValue}>{String(recipe.nutrition.fat_g)}g</span>
            <span className={styles.nutrientLabel}>Fat</span>
          </div>
        </div>
      </section>

      <TierGate requiredTier="premium">
        <PersonalizedSection recipeId={id} />
      </TierGate>

      {recipe.recipe_ingredients !== undefined && recipe.recipe_ingredients.length > 0 && (
        <section aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className={styles.sectionHeading}>Ingredients</h2>
          <ul className={styles.ingredientList}>
            {recipe.recipe_ingredients
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((ri) => (
                <li key={ri.id} className={styles.ingredientItem}>
                  <span className={styles.ingredientQty}>
                    {ri.quantity} {ri.unit}
                  </span>
                  <span className={styles.ingredientName}>
                    {ri.ingredient.name}
                    {ri.preparation != null && (
                      <span className={styles.ingredientPrep}>, {ri.preparation}</span>
                    )}
                    {ri.is_optional && (
                      <span className={styles.ingredientOptional}> (optional)</span>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {recipe.instructions.length > 0 && (
        <section aria-labelledby="instructions-heading">
          <h2 id="instructions-heading" className={styles.sectionHeading}>Instructions</h2>
          <ol className={styles.instructionList}>
            {recipe.instructions.map((step) => (
              <li key={step.step} className={styles.instructionStep}>
                <span className={styles.stepNum}>{String(step.step)}</span>
                <span className={styles.stepText}>{step.text}</span>
                {step.duration_min !== null && step.duration_min !== undefined && (
                  <span className={styles.stepTime}>{String(step.duration_min)} min</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.tips !== null && (
        <section aria-labelledby="tips-heading">
          <h2 id="tips-heading" className={styles.sectionHeading}>Tips</h2>
          <p className={styles.tips}>{recipe.tips}</p>
        </section>
      )}

      {recipe.citations.length > 0 && (
        <section aria-labelledby="citations-heading">
          <h2 id="citations-heading" className={styles.sectionHeading}>Sources</h2>
          <ul className={styles.citationList}>
            {recipe.citations.map((c, idx) => (
              <li key={`${c.url ?? 'no-url'}-${String(idx)}`} className={styles.citationItem}>
                {c.url !== undefined ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.citationLink}
                  >
                    {c.title}
                  </a>
                ) : (
                  <span>{c.title}</span>
                )}
                <span className={styles.citationType}>· {c.source_type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DisclaimerBanner />
    </div>
  );
}
