/**
 * Return the normalized direction to march in from the eye point for a single pixel.
 * 
 * fieldOfView: vertical field of view in degrees
 * size: resolution of the output image
 * fragCoord: the x,y coordinate of the pixel in the output image
 */
vec3 rayDirection(float fieldOfView, vec2 size, vec2 fragCoord) {
    vec2 i_xy = fragCoord - size / 2.0;
    float i_z = size.y / tan(radians(fieldOfView) / 2.0);
    return normalize(vec3(i_xy, -i_z));
}

#pragma glslify: export(rayDirection)