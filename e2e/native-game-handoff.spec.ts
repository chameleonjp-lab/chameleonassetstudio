import { expect, test } from '@playwright/test';

test('game information panel identifies collider fields as metadata and links to engine setup steps', async ({
  page,
}) => {
  await page.goto('/3d/');
  await page
    .getByLabel('新しいプロジェクト名', { exact: true })
    .fill('GAME-04 handoff instructions');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByText('ゲーム向け情報を編集', { exact: true }).click();

  const game = page.getByRole('region', { name: '3Dゲーム向け情報', exact: true });
  await expect(game).toContainText('game.jsonに保存するmetadata');
  await expect(game).toContainText('GLBに物理bodyや衝突componentは追加されません');
  const guideLink = game.getByRole('link', {
    name: '受渡し先でのcollider設定手順を見る',
    exact: true,
  });
  await expect(guideLink).toHaveAttribute('href', '../guide/3d/#collider-handoff');
  await expect(guideLink).toHaveAttribute('target', '_blank');
});

test('3D guide gives concrete engine-native collider mapping without claiming runtime verification', async ({
  page,
}) => {
  await page.goto('/guide/3d/#collider-handoff');
  const guide = page.locator('#collider-handoff');
  await expect(
    guide.getByRole('heading', { name: 'colliderを受渡し先のphysicsへ設定する' }),
  ).toBeVisible();
  await expect(guide).toContainText('GLBと、同じ出力で作った');
  await expect(guide).toContainText('game.colliders[]');
  await expect(guide).toContainText('modelHash');
  await expect(guide).toContainText(/game\.json\s+の\s+nodes\s+対応表/);
  await expect(guide).toContainText('X/Y/Zの全寸法（m）');
  await expect(guide).toContainText('sphereは半径（m）');
  await expect(guide).toContainText('capsuleは半径（m）と円柱部の長さ（m）');
  await expect(guide).toContainText('height + 2 × radius');
  await expect(guide).toContainText('physicsの設定値ではありません');
  await expect(guide).toContainText(
    '実projectでのimport・physics runtime検証は、このアプリでは未実施',
  );
  await expect(guide.getByRole('link', { name: 'Unity 6: collisionとtrigger' })).toHaveAttribute(
    'href',
    'https://docs.unity.com/en-us/engine/6000.0/manual/physics-section/physics-overview/collision-section/colliders-overview',
  );
  await expect(guide.getByRole('link', { name: 'CapsuleColliderの寸法' })).toHaveAttribute(
    'href',
    'https://docs.unity.com/en-us/engine/6000.0/manual/physics-section/physics-overview/collision-section/collider-shapes/primitive-colliders/class-capsule-collider',
  );
  await expect(guide.getByRole('link', { name: 'Godot: CollisionShape3D' })).toHaveAttribute(
    'href',
    'https://docs.godotengine.org/en/stable/classes/class_collisionshape3d.html',
  );
});

test('independent consumer labels colliders as sidecar data and not simulated physics', async ({
  page,
}) => {
  await page.goto('http://localhost:4177/');
  await expect(page.getByText(/Metadata does not implement game physics/)).toContainText(
    'does not create physics bodies or collision shapes',
  );
});
