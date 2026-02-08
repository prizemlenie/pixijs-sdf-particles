const sampleSdfShader = /* glsl */ `
uniform sampler2D uSdf0;
uniform sampler2D uSdf1;
uniform sampler2D uSdf2;
uniform sampler2D uSdf3;

// Sampling SDF texture by index
vec3 sampleSdf(int index, vec2 uv) {
    if (index == 0) return texture(uSdf0, uv).xyz;
    if (index == 1) return texture(uSdf1, uv).xyz;
    if (index == 2) return texture(uSdf2, uv).xyz;
    return texture(uSdf3, uv).xyz;
}
`;

export default sampleSdfShader;
