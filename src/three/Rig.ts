import * as THREE from 'three';

/**
 * 相机支架：房间每帧给出「想去的位置 / 想看的点」，这里做平滑跟随，
 * 再叠加一点鼠标环顾。转场时由 GSAP 直接驱动 curPos / curTarget（locked = true）。
 */
export class Rig {
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  readonly curPos = new THREE.Vector3();
  readonly curTarget = new THREE.Vector3();
  readonly look = new THREE.Vector2();
  lookStrength = 1;
  fov = 60;
  locked = false;

  private smoothLook = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap() {
    this.curPos.copy(this.pos);
    this.curTarget.copy(this.target);
  }

  update(dt: number) {
    if (!this.locked) {
      const k = 1 - Math.exp(-dt * 3.5);
      this.curPos.lerp(this.pos, k);
      this.curTarget.lerp(this.target, k);
    }
    this.smoothLook.lerp(this.look, 1 - Math.exp(-dt * 4));
    const dir = this.tmp.subVectors(this.curTarget, this.curPos);
    const dist = dir.length();
    this.right.crossVectors(dir, this.up).normalize();
    const s = dist * 0.18 * this.lookStrength;
    this.tmp.copy(this.curTarget)
      .addScaledVector(this.right, this.smoothLook.x * s)
      .addScaledVector(this.up, -this.smoothLook.y * s * 0.55);
    this.camera.position.copy(this.curPos);
    this.camera.lookAt(this.tmp);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov += (this.fov - this.camera.fov) * (1 - Math.exp(-dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }
}
