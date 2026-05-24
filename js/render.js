import { GRAVITATION, SPACECRAFT_MASS, Spark, Landing, Container, Planet } from "./physics.js";
import {
  COLORS, PIf, PI2f, SPACESHIP_LEGS, SPACESHIP_PATH, THRUST_PATH,
  clamp, createPolygonPath, createStarPath, lerp, mag, sub,
} from "./utils.js";

export const DRAW_ORBITS = true;
export const DRAW_GRAVITATIONAL_FIELDS = true;
export const DRAW_STAR_GRAVITATIONAL_FIELDS = true;
export const STAR_POINTS = 31;

export const DEFAULT_CAMERA_ZOOM = 1;
export const MIN_CAMERA_ZOOM = 250 / 200000;
export const MAX_CAMERA_ZOOM = 5;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./universe.js').Universe} u
 * @param {number} w
 * @param {number} h
 * @param {number} cameraZoom
 * @param {{ x: number, y: number }} cameraOffset
 * @param {boolean} dynamicZoom
 */
export function renderFrame(ctx, u, w, h, cameraZoom, cameraOffset, dynamicZoom) {
  ctx.fillStyle = COLORS.eigengrau;
  ctx.fillRect(0, 0, w, h);

  const closest = u.closestPlanet();
  const distToNearestSurf = Math.max(0, mag(sub(u.ship.pos, closest.pos)) - closest.radius * 1.2);

  let zoom = cameraZoom;
  if (!u._touchZoom) {
    const targetZoom = dynamicZoom
      ? clamp(500 / distToNearestSurf, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM)
      : DEFAULT_CAMERA_ZOOM;
    u._smoothedZoom = expSmooth(u._smoothedZoom ?? zoom, targetZoom, u.dt, 1.5);
    zoom = u._smoothedZoom;
  }

  if (!u._touchPan) {
    cameraOffset = { x: -(u.follow?.pos.x ?? 0), y: -(u.follow?.pos.y ?? 0) };
  }

  const visibleW = w / zoom;
  const visibleH = h / zoom;
  const centerFracX = 0.5;
  const centerFracY = 0.5;

  // cameraOffset ≈ -shipPos；可见区域以 -cameraOffset（飞船位置）为中心
  const viewCenterX = -cameraOffset.x;
  const viewCenterY = -cameraOffset.y;

  const rectLeft = viewCenterX - visibleW * centerFracX;
  const rectTop = viewCenterY - visibleH * centerFracY;
  const rectRight = rectLeft + visibleW;
  const rectBottom = rectTop + visibleH;
  const viewBounds = { left: rectLeft, top: rectTop, right: rectRight, bottom: rectBottom };
  const viewDiag = Math.hypot(visibleW, visibleH);

  let gridStep = 1000;
  while (gridStep * zoom < 32) gridStep *= 10;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-(rectLeft + visibleW / 2), -(rectTop + visibleH / 2));

  drawGrid(ctx, rectLeft, rectTop, rectRight, rectBottom, gridStep, zoom);

  for (const c of u.constraints) {
    if (c instanceof Landing) drawLanding(ctx, c, zoom);
    else if (c instanceof Container) drawContainer(ctx, c, zoom);
  }

  drawStar(ctx, u.star, zoom, viewBounds, viewDiag);
  for (const e of u.entities) {
    if (e === u.star) continue;
    if (e instanceof Spark) {
      if (isInView(e.pos, viewBounds, 20)) drawSpark(ctx, e, zoom);
    } else if (e instanceof Planet) {
      drawPlanet(ctx, e, zoom, viewBounds, viewDiag);
    }
  }

  if (u.ship.autopilot?.enabled) drawAutopilot(ctx, u.ship.autopilot, zoom, u.now);
  drawSpacecraft(ctx, u.ship, zoom, viewBounds);

  ctx.restore();

  return { zoom, cameraOffset };
}

function expSmooth(current, target, dt, speed) {
  return current + (target - current) * (1 - Math.exp(-dt * speed));
}

/** @param {CanvasRenderingContext2D} ctx */
function drawGrid(ctx, left, top, right, bottom, gridStep, zoom) {
  ctx.strokeStyle = COLORS.eigengrau2;
  let x = Math.floor(left / gridStep) * gridStep;
  while (x < right) {
    ctx.lineWidth = (x % (gridStep * 10) === 0 ? 3 : 1.5) / zoom;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    x += gridStep;
  }
  let y = Math.floor(top / gridStep) * gridStep;
  while (y < bottom) {
    ctx.lineWidth = (y % (gridStep * 10) === 0 ? 3 : 1.5) / zoom;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += gridStep;
  }
}

/** @param {CanvasRenderingContext2D} ctx */
function drawContainer(ctx, container, zoom) {
  ctx.strokeStyle = "rgba(128,0,0,0.5)";
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([8 / zoom, 8 / zoom]);
  ctx.beginPath();
  ctx.arc(0, 0, container.radius, 0, PI2f);
  ctx.stroke();
  ctx.setLineDash([]);
}

function isInView(pos, bounds, margin = 0) {
  return (
    pos.x >= bounds.left - margin &&
    pos.x <= bounds.right + margin &&
    pos.y >= bounds.top - margin &&
    pos.y <= bounds.bottom + margin
  );
}

function circleIntersectsView(cx, cy, r, bounds) {
  const closestX = clamp(cx, bounds.left, bounds.right);
  const closestY = clamp(cy, bounds.top, bounds.bottom);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

/** @param {CanvasRenderingContext2D} ctx */
function drawGravitationalField(ctx, planet, zoom, viewBounds, viewDiag) {
  const rings = 8;
  const maxRingRadius = viewDiag * 1.25;
  for (let i = 0; i < rings; i++) {
    const force = lerp(200, 0.01, i / rings);
    const r = Math.sqrt((GRAVITATION * planet.mass * SPACECRAFT_MASS) / force);
    if (r > maxRingRadius) continue;
    if (!circleIntersectsView(planet.pos.x, planet.pos.y, r, viewBounds)) continue;
    ctx.strokeStyle = `rgba(255,0,0,${lerp(0.5, 0.1, i / rings)})`;
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(planet.pos.x, planet.pos.y, r, 0, PI2f);
    ctx.stroke();
  }
}

/** @param {CanvasRenderingContext2D} ctx */
function drawPlanet(ctx, planet, zoom, viewBounds, viewDiag) {
  if (!circleIntersectsView(planet.pos.x, planet.pos.y, planet.radius, viewBounds)) return;

  if (DRAW_ORBITS) {
    const orbitR = mag(sub(planet.pos, planet.orbitCenter));
    if (circleIntersectsView(planet.orbitCenter.x, planet.orbitCenter.y, orbitR, viewBounds)) {
      ctx.strokeStyle = "rgba(0,255,255,0.5)";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(planet.orbitCenter.x, planet.orbitCenter.y, orbitR, 0, PI2f);
      ctx.stroke();
    }
  }

  if (DRAW_GRAVITATIONAL_FIELDS) drawGravitationalField(ctx, planet, zoom, viewBounds, viewDiag);

  ctx.fillStyle = COLORS.eigengrau;
  ctx.beginPath();
  ctx.arc(planet.pos.x, planet.pos.y, planet.radius, 0, PI2f);
  ctx.fill();

  ctx.strokeStyle = planet.color;
  ctx.lineWidth = 2 / zoom;
  ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx */
function drawStar(ctx, star, zoom, viewBounds, viewDiag) {
  ctx.save();
  ctx.translate(star.pos.x, star.pos.y);

  ctx.fillStyle = star.color;
  ctx.beginPath();
  ctx.arc(0, 0, star.radius, 0, PI2f);
  ctx.fill();

  if (DRAW_STAR_GRAVITATIONAL_FIELDS) {
    ctx.restore();
    drawGravitationalField(ctx, star, zoom, viewBounds, viewDiag);
    ctx.save();
    ctx.translate(star.pos.x, star.pos.y);
  }

  ctx.strokeStyle = star.color;
  ctx.lineWidth = 3 / zoom;
  ctx.lineJoin = "round";

  ctx.rotate((star.anim / 23) * PI2f);
  ctx.stroke(createStarPath(star.radius + 80, star.radius + 250, STAR_POINTS));

  ctx.rotate(-(star.anim / 23) * PI2f);
  ctx.rotate((star.anim / -19) * PI2f);
  ctx.stroke(createStarPath(star.radius + 20, star.radius + 200, STAR_POINTS + 1));

  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx */
function drawSpacecraft(ctx, ship, zoom, viewBounds) {
  drawTrack(ctx, ship.track, zoom, viewBounds);

  ctx.save();
  ctx.translate(ship.pos.x, ship.pos.y);
  ctx.rotate(ship.angle);

  if (ship.landing) {
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 2 / zoom;
    ctx.stroke(SPACESHIP_LEGS);
  }

  ctx.fillStyle = COLORS.eigengrau;
  ctx.fill(SPACESHIP_PATH);

  ctx.strokeStyle = ship.transit ? "#000000" : "#ffffff";
  ctx.lineWidth = 2 / zoom;
  ctx.stroke(SPACESHIP_PATH);

  if (mag(ship.thrust) > 0) {
    ctx.strokeStyle = "#ff8800";
    ctx.lineWidth = 2 / zoom;
    ctx.lineJoin = "round";
    ctx.save();
    ctx.translate(-5, 0);
    ctx.stroke(THRUST_PATH);
    ctx.restore();
  }

  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx */
function drawTrack(ctx, track, zoom, viewBounds) {
  const pts = track.positions;
  if (pts.length < 2) return;

  // 只绘制视口内及最近一段轨迹，避免上万点拖慢帧率
  const start = Math.max(0, pts.length - 800);
  ctx.strokeStyle = COLORS.track;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  let moved = false;
  for (let i = start; i < pts.length; i++) {
    if (!isInView(pts[i], viewBounds, 500) && moved) continue;
    if (!moved) {
      ctx.moveTo(pts[i].x, pts[i].y);
      moved = true;
    } else {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
  }
  if (moved) ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx */
function drawLanding(ctx, landing, zoom) {
  const v = {
    x: landing.planet.pos.x + Math.cos(landing.angle) * landing.planet.radius,
    y: landing.planet.pos.y + Math.sin(landing.angle) * landing.planet.radius,
  };
  const height = 80;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(landing.angle);
  ctx.strokeStyle = COLORS.flag;
  ctx.lineWidth = 2 / zoom;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(height, 0);
  ctx.lineTo(height * 0.875, height * 0.25);
  ctx.lineTo(height * 0.75, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx */
function drawSpark(ctx, spark, zoom) {
  if (spark.fuse.lifetime < 0) return;
  const life = 1 - spark.fuse.lifetime / spark.ttl;
  ctx.strokeStyle = spark.color;
  ctx.fillStyle = spark.color;

  switch (spark.style) {
    case Spark.Style.LINE:
      if (spark.opos.x || spark.opos.y) {
        ctx.lineWidth = spark.size;
        ctx.beginPath();
        ctx.moveTo(spark.opos.x, spark.opos.y);
        ctx.lineTo(spark.pos.x, spark.pos.y);
        ctx.stroke();
      }
      break;
    case Spark.Style.DOT:
      ctx.beginPath();
      ctx.arc(spark.pos.x, spark.pos.y, spark.size, 0, PI2f);
      ctx.fill();
      break;
    case Spark.Style.RING: {
      const alpha = parseFloat(spark.color.match(/[\d.]+\)$/)?.[0] ?? "0.25");
      const radius = Math.exp(lerp(spark.size, 3 * spark.size, life)) - 1;
      ctx.strokeStyle = spark.color.replace(/[\d.]+\)$/, `${alpha * (1 - life)})`);
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(spark.pos.x, spark.pos.y, radius, 0, PI2f);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** @param {CanvasRenderingContext2D} ctx */
function drawAutopilot(ctx, autopilot, zoom, now) {
  const color = "rgba(66,133,244,0.5)";
  const target = autopilot.target;
  if (!target) return;

  ctx.save();
  ctx.translate(target.pos.x, target.pos.y);
  ctx.rotate((now * PI2f) / 10);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / zoom;
  ctx.stroke(createPolygonPath(target.radius + autopilot.brakingDistance, 15));
  ctx.lineWidth = autopilot.landingAltitude;
  ctx.beginPath();
  ctx.arc(0, 0, target.radius + autopilot.landingAltitude / 2, 0, PI2f);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.moveTo(autopilot.universe.ship.pos.x, autopilot.universe.ship.pos.y);
  ctx.lineTo(autopilot.leadingPos.x, autopilot.leadingPos.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(autopilot.leadingPos.x, autopilot.leadingPos.y, 5 / zoom, 0, PI2f);
  ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx @param {import('./utils.js').Vec2} origin @param {import('./utils.js').Vec2} target @param {number} minR @param {number} maxR */
export function drawFlightStick(ctx, origin, target, minR, maxR) {
  if (origin.x === 0 && origin.y === 0) return;

  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const deltaMag = Math.hypot(dx, dy);
  const mag = Math.min(maxR, deltaMag);
  const r = Math.max(minR, mag);
  const a = Math.atan2(dy, dx);

  ctx.strokeStyle = "#34a853";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (deltaMag < minR) ctx.setLineDash([4, 8]);
  ctx.arc(origin.x, origin.y, r, 0, PI2f);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(origin.x + Math.cos(a) * mag, origin.y + Math.sin(a) * mag);
  ctx.stroke();
}
