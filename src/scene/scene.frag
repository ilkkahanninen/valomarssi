#version 300 es
//[
precision highp float;
//]

#pragma glslify: sphere = require("./primitives/sphere.frag")
#pragma glslify: cube = require("./primitives/cube.frag")
#pragma glslify: cappedCylinder = require("./primitives/cappedCylinder.frag")
#pragma glslify: rayDirection = require("./projection/rayDirection.frag")
#pragma glslify: viewMatrix = require("./projection/viewMatrix.frag")
#pragma glslify: opUnion = require("./ops/opUnion.frag")
#pragma glslify: opIntersect = require("./ops/opIntersect.frag")
#pragma glslify: opDiff = require("./ops/opDiff.frag")
#pragma glslify: opRUnion = require("./ops/opRUnion.frag")
#pragma glslify: opRIntersect = require("./ops/opRIntersect.frag")
#pragma glslify: opRDiff = require("./ops/opRDiff.frag")
#pragma glslify: smUnion = require("./ops/smUnion.frag")
#pragma glslify: rotateX = require("./transform/rotateX.frag")
#pragma glslify: rotateZ = require("./transform/rotateZ.frag")
#pragma glslify: rotateY = require("./transform/rotateY.frag")

const int i_MAX_MARCHING_STEPS = 255;
const float i_MIN_DIST = 0.0;
const float i_MAX_DIST = 15.0;
const float i_EPSILON = 0.00001;
const float i_STEP_CORRECTION = 0.9; // lower -> better quality, but slower
const float i_PI = 3.1415;

const vec2 RESOLUTION = vec2(1280, 720);
uniform float _T;
out vec4 _C;

// Result structure:
//  x = distance
//  y = material
//  z = unused
//  w = unused

const int MATERIAL_ENV = 0;
const int MATERIAL_FARJAN = 1;
const int MATERIAL_BALLS = 2;
const int MATERIAL_ENV2 = 3;
const int MATERIAL_FARJAN2 = 4;

float sdRoundBox( vec3 p, vec3 b, float r )
{
  vec3 i_q = abs(p) - b;
  return length(max(i_q,0.0)) + min(max(i_q.x,max(i_q.y,i_q.z)),0.0) - r;
}

float sdRoundedCylinder( vec3 p, float ra, float rb, float h )
{
  vec2 i_d = vec2( length(p.xz)-2.0*ra+rb, abs(p.y) - h );
  return min(max(i_d.x,i_d.y),0.0) + length(max(i_d,0.0)) - rb;
}

float kansio(vec3 p, vec3 b, vec3 skewPt, float skew) {
    float i_s = skew * (p.y - skewPt.y);
    vec3 i_q = abs(p) - b - vec3(i_s, 0.0, i_s);
    return length(max(i_q, 0.0)) + min(max(i_q.x, max(i_q.y, i_q.z)), 0.0);
}

vec2 farjan(vec3 p) {
  float i_alapohjaBody = sdRoundBox(p, vec3(0.5, 0.1, 0.4), 0.1);
  float i_alapohjaKeula = sdRoundedCylinder(p + vec3(0.5, 0., 0.), 0.25, 0.1, 0.1);
  float i_alapohja = opUnion(i_alapohjaBody, i_alapohjaKeula);

  float i_ylapohjaBody = sdRoundBox(p, vec3(0.52, 0.12, 0.42), 0.1);
  float i_ylapohjaKeula = sdRoundedCylinder(p + vec3(0.5, 0., 0.), 0.26, 0.1, 0.12);
  float i_ylapohjaLeikkaus = cube(p + vec3(0.0, 1.0, 0.0), vec3(2.0, 1.0, 2.0));
  float i_ylapohja = opDiff(opUnion(i_ylapohjaBody, i_ylapohjaKeula), i_ylapohjaLeikkaus);

  vec3 i_kaiteetP = p + vec3(0.0, -0.2, 0.0);
  float i_kaiteetBody = sdRoundBox(i_kaiteetP, vec3(0.53, 0.11, 0.43), 0.02);
  float i_kaiteetKeula = sdRoundedCylinder(i_kaiteetP + vec3(0.5, 0., 0.), 0.225, 0.02, 0.11);
  float i_kaiteetLeikkaus = cappedCylinder(i_kaiteetP + vec3(0.5, 0., 0.), 0.4, 0.2);
  float i_kaiteet = opDiff(
    opUnion(i_kaiteetBody, i_kaiteetKeula),
    i_kaiteetLeikkaus
  );

  vec3 i_komentosiltaP = p + vec3(0.1, -0.4, 0.0);
  float i_komentosiltaBody = kansio(i_komentosiltaP, vec3(0.55, 0.2, 0.46), vec3(0.1, -0.4, 0.0), -0.2);
  float i_komentosiltaLeikkaus = cube(p + vec3(-0.3, -0.6, 0.0), vec3(0.4, 0.12, 0.5));
  float i_komentosiltaLeikkaus2 = cube(p + vec3(0., -0.52, 0.0), vec3(0.2, 0.15, 0.5));
  float i_komentosilta = opDiff(i_komentosiltaBody, opUnion(i_komentosiltaLeikkaus, i_komentosiltaLeikkaus2));

  float i_komentosiltaYla = kansio(p + vec3(0.3, -0.7, 0.0), vec3(0.2, 0.1, 0.4), vec3(0.1, -0.6, 0.0), -0.2);

  float i_kannet = kansio(p + vec3(0., -0.4, 0.0), vec3(0.35, 0.2, 0.3), vec3(0., -0.2, 0.), -0.2);

  return opRUnion(
    vec2(i_alapohja, MATERIAL_FARJAN),
    vec2(opUnion(
      opUnion(i_ylapohja, i_kaiteet),
      opUnion(opUnion(i_komentosilta, i_komentosiltaYla), i_kannet)
    ), MATERIAL_FARJAN2)
  );
}

vec2 environment(vec3 p) {
  const float i_f = 8.0;
  const float i_size = 5.0;
  float i_s = sphere(p / i_size) * i_size;
  float i_distort = sin(p.x * i_size) * sin(p.y * 2.0) * sin(p.z * i_f);
  return vec2(-i_s + i_distort * 0.1, MATERIAL_ENV);
}

vec2 environment2(vec3 p0) {
  const float i_k = 1.0;
  float i_cos = cos(i_k * p0.y);
  float i_sin = sin(i_k * p0.y);
  mat2 i_twistMatrix = mat2(i_cos, -i_sin, i_sin, i_cos);
  vec3 p = vec3(i_twistMatrix * p0.xz, p0.y);

  const float i_size = 4.0;
  float i_s = sphere(p / i_size) * i_size;

  float size2 = 1.3 + mod(_T, 1.0) * 0.2;
  vec3 i_c = vec3(2.0, 2.0, 2.0);
  float i_s2 = sphere((mod(p + i_c * 0.5, i_c) - i_c * 0.5) / size2) * size2;

  float i_f = 8.0 * length(p);
  float i_distort = sin(sin(p.x * i_f) * sin(p.y * i_f) * sin(p.z * i_f));

  return vec2(opDiff(i_s, i_s2) + i_distort * 0.01, MATERIAL_ENV2);
}

vec2 envUnion(vec3 p) {
  if (_T >= 96.0 && _T < 128.0 || _T >= 192.0 && _T < 224.0)
    return environment(p);
  return opRUnion(environment(p), environment2(p));
}

vec2 metaBalls(vec3 p) {
  const float i_size = 0.25;
  float dist = 1000.0;
  for (int i = 0; i < 8; i++) {
    float f = pow(float(i), 2.0) + _T * (1.0 + float(i) * 0.2);
    vec3 i_p1 = p + vec3(sin(f * 0.5), cos(f * 0.4), sin(f * 0.3)) * 0.5;
    float i_s = sphere(i_p1 / i_size) * i_size;
    dist = smUnion(dist, i_s, 0.3 + sin(_T) * 0.3);
  }
  float i_distort = sin(p.x * 20.0) * sin(p.y * 20.0) * sin(p.z * 20.0);
  return vec2(dist + (_T < 160.0 ? 0.0 : i_distort * (0.05 + sin(_T * 0.3) * 0.04)), MATERIAL_BALLS);
}

vec2 render(vec3 p) {
  vec3 i_p1 = rotateY(p, _T * floor(_T / 32.0) * 0.1);

  vec2 i_env = envUnion(i_p1);
  vec2 i_plainEnv = environment(p);

  vec2 i_balls = metaBalls(i_p1);

  vec2 i_farjan = farjan(i_p1);

  float part = floor(_T / 32.0);
  if (part < 1.)
    return i_plainEnv;
  if (part < 2.)
    return i_env;
  if (part < 3.)
    return opRUnion(i_plainEnv, i_balls);
  if (part < 4.)
    return opRUnion(i_env, i_balls);
  if (part < 5.)
    return opRUnion(i_env, mod(_T, 2.0) < 1.0 ? i_farjan : i_balls);
  if (part < 6.)
    return opRUnion(i_env, mod(_T, 2.0) < 1.0 ? i_farjan : i_balls);
  if (part < 7.)
    return opRUnion(i_plainEnv, i_balls);
  if (part < 8.)
    return opRUnion(i_env, mod(_T, 2.0) < 1.0 ? i_farjan : i_balls);
}

vec2 shortestDistanceToSurface(vec3 eye, vec3 marchingDirection, bool envOnly) {
  float depth = i_MIN_DIST;
  for (int i = 0; i < i_MAX_MARCHING_STEPS; i++) {
    vec3 i_p = eye + depth * marchingDirection;
    vec2 r = envOnly ? envUnion(i_p) : render(i_p);
    float i_dist = r.x;
    if (i_dist < i_EPSILON) {
      r.x = depth;
      return r;
    }
    depth += i_dist * i_STEP_CORRECTION;
    // if (depth >= end) {
    //   r.x = end;
    //   return r;
    // }
  }
  // return vec2(end, -1);
}

/**
 * Using the gradient of the SDF, estimate the normal on the surface at point p.
 */
vec3 estimateNormal(vec3 p) {
  return normalize(vec3(render(vec3(p.x + i_EPSILON, p.y, p.z)).x - render(vec3(p.x - i_EPSILON, p.y, p.z)).x, render(vec3(p.x, p.y + i_EPSILON, p.z)).x - render(vec3(p.x, p.y - i_EPSILON, p.z)).x, render(vec3(p.x, p.y, p.z + i_EPSILON)).x - render(vec3(p.x, p.y, p.z - i_EPSILON)).x));
}

/**
 * Lighting contribution of a single point light source via Phong illumination.
 * 
 * The vec3 returned is the RGB color of the light's contribution.
 *
 * k_a: Ambient color
 * k_d: Diffuse color
 * k_s: Specular color
 * alpha: Shininess coefficient
 * p: position of point being lit
 * eye: the position of the camera
 * lightPos: the position of the light
 * lightIntensity: color/intensity of the light
 *
 * See https://en.wikipedia.org/wiki/Phong_reflection_model#Description
 */
vec3 phongContribForLight(vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye, vec3 lightPos, vec3 lightIntensity) {
  vec3 i_N = estimateNormal(p);
  vec3 i_L = normalize(lightPos - p);
  vec3 i_V = normalize(eye - p);
  vec3 i_R = normalize(reflect(-i_L, N));

  float dotLN = dot(i_L, i_N);
  float dotRV = dot(i_R, i_V);

  if (dotLN < 0.0) {
    // Light not visible from this point on the surface
    return vec3(0.0, 0.0, 0.0);
  }

  if (dotRV < 0.0) {
    // Light reflection in opposite direction as viewer, apply only diffuse
    // component
    return lightIntensity * (k_d * dotLN);
  }
  return lightIntensity * (k_d * dotLN + k_s * pow(dotRV, alpha));
}

/**
 * Lighting via Phong illumination.
 * 
 * The vec3 returned is the RGB color of that point after lighting is applied.
 * k_a: Ambient color
 * k_d: Diffuse color
 * k_s: Specular color
 * alpha: Shininess coefficient
 * p: position of point being lit
 * eye: the position of the camera
 *
 * See https://en.wikipedia.org/wiki/Phong_reflection_model#Description
 */
vec3 phongIllumination(vec3 k_a, vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye) {
  const vec3 ambientLight = vec3(0.5, 0.5, 0.5);
  vec3 i_ambientColor = ambientLight * k_a;
  float i_y = sin(_T) * 4.0;

  vec3 i_light1Pos = vec3(3.0 * cos(_T * 0.2), 0.0, 3.0 * sin(_T * 0.2));
  vec3 i_light1Intensity = vec3(0.4, 0.4, 0.4);
  vec3 i_light1 = phongContribForLight(k_d, k_s, alpha, p, eye, i_light1Pos, i_light1Intensity);

  vec3 i_light2Pos = vec3(3.0 * sin(_T * 0.37), i_y, 3.0 * cos(_T * 0.37));
  vec3 i_light2Intensity = vec3(0.4, 0.4, 0.4);
  vec3 i_light2 = phongContribForLight(k_d, k_s, alpha, p, eye, i_light2Pos, i_light2Intensity);

  return i_ambientColor + i_light1 + i_light2;
}

vec3 postProcess(vec3 color) {
  float i_maxDist = length(RESOLUTION.xy) / 2.0;
  float i_scanlineDensity = 1.1 + sin(floor(_T));
  float i_scanline = (0.6 + sin(gl_FragCoord.y * i_scanlineDensity + _T * 5.0) * 0.6);
  float i_strength = (pow(length(gl_FragCoord.xy - RESOLUTION.xy / 2.0) / i_maxDist, 10.0)) * i_scanline;
  float i_fade = min(min(1.0, _T / 32.0), 1.0 - (_T - 240.0) / 16.0);
  return color * (1.3 - i_strength) * i_fade;
}

vec3 calcEnvMaterial(vec3 p, vec3 eye, int material) {
  if (material == MATERIAL_ENV) {
    vec3 i_K_a = vec3(0.0, 0.15, 0.2);
    vec3 i_K_d = vec3(0.0, 0.2 + sin(_T) * 0.2, 0.7);
    vec3 i_K_s = vec3(0.5, 1.0, 0.8 + sin(_T * 0.5) * 0.1);
    float i_shininess = 50.0 + cos(_T * i_PI) * 40.0;
    return phongIllumination(i_K_a, i_K_d, i_K_s, i_shininess, p, eye);
  }

  vec3 i_K_a = vec3(0.0, 0.0, 0.5);
  vec3 i_K_d = vec3(1.0, 0.0, 0.0);
  vec3 i_K_s = vec3(1.0, 1.0, 1.0);
  float i_shininess = 150.0 + sin(_T * 16.0) * 40.0;
  return phongIllumination(i_K_a, i_K_d, i_K_s, i_shininess, p, eye);
}

vec3 calcMaterial(vec3 p, vec3 eye, vec3 worldDir, int material) {
  if (material == MATERIAL_ENV) {
    return calcEnvMaterial(p, eye, MATERIAL_ENV);
  } else if (material == MATERIAL_ENV2) {
    return calcEnvMaterial(p, eye, MATERIAL_ENV2);
  } else if (material == MATERIAL_BALLS) {
    vec3 n = estimateNormal(p);
    vec3 i_reflectionDir = reflect(worldDir, n);
    vec2 i_rEnv = shortestDistanceToSurface(p, i_reflectionDir, true);

    vec3 i_reflectionColor = calcEnvMaterial(p + i_rEnv.x * i_reflectionDir, p, int(i_rEnv.y));

    vec3 i_K_a = vec3(0.3, 0.3, 0.0);
    vec3 i_K_d = vec3(1.0, 1.0, 0.0);
    vec3 i_K_s = vec3(1.0, 1.0, 0.0);
    float i_shininess = 10.0;
    vec3 bodyColor = phongIllumination(i_K_a, i_K_d, i_K_s, i_shininess, p, eye);

    return (bodyColor + i_reflectionColor) * 0.5;
  } else if (material == MATERIAL_FARJAN) {
    vec3 i_K_a = vec3(0.4, 0.2, 0.2);
    vec3 i_K_d = vec3(1.0, 0.1, 0.2);
    vec3 i_K_s = vec3(1.0, 1.0, 1.0);
    float i_shininess = 40.0;
    return phongIllumination(i_K_a, i_K_d, i_K_s, i_shininess, p, eye);
  } else if (material == MATERIAL_FARJAN2) {
    vec3 i_K_a = vec3(0.7, 0.7, 0.7);
    vec3 i_K_d = vec3(1.0, 1.0, 1.0);
    vec3 i_K_s = vec3(1.0, 1.0, 1.0);
    float i_shininess = 40.0;
    return phongIllumination(i_K_a, i_K_d, i_K_s, i_shininess, p, eye);
  }

  return vec3(0.0, 0.0, 0.0);
}

void main() {
  float i_fovDensity = _T < 32.0 ? 4.0 : _T < 64.0 ? 2.0 : 1.0;
  vec3 i_viewDir = rayDirection(90.0 + sin(floor(_T / i_fovDensity) * 1000.0) * 60.0, RESOLUTION.xy, gl_FragCoord.xy);
  vec3 i_eye = vec3(3.0, 0.0, 0.0);
  vec3 i_up = normalize(vec3(cos(_T * 0.1), sin(_T * 0.1), cos(_T * 0.12)));

  mat4 i_viewToWorld = viewMatrix(i_eye, vec3(0.0, 0.0, 0.0), i_up);

  vec3 worldDir = (i_viewToWorld * vec4(i_viewDir, 0.0)).xyz;

  vec2 r = shortestDistanceToSurface(i_eye, worldDir, false);
  float i_dist = r.x;
  float i_material = r.y;

  if (i_dist > i_MAX_DIST - i_EPSILON) {
    // Didn't hit anything
    _C = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 i_p = i_eye + i_dist * worldDir;
  vec3 i_color = calcMaterial(i_p, i_eye, worldDir, int(i_material));

  _C = vec4(postProcess(i_color), 1.0);
}