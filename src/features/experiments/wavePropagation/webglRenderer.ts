import type { WaveField } from './physics'
import type { WaveCamera, WaveColorTheme } from './renderer'

interface MeshResources {
  gl: WebGLRenderingContext
  program: WebGLProgram
  positionBuffer: WebGLBuffer
  fieldBuffer: WebGLBuffer
  triangleBuffer: WebGLBuffer
  lineBuffer: WebGLBuffer
  triangleCount: number
  lineCount: number
  field: WaveField | null
  attributes: {
    position: number
    field: number
  }
  uniforms: {
    phase: WebGLUniformLocation
    displayScale: WebGLUniformLocation
    fieldSize: WebGLUniformLocation
    viewport: WebGLUniformLocation
    cameraAngles: WebGLUniformLocation
    cameraView: WebGLUniformLocation
    theme: WebGLUniformLocation
    linePass: WebGLUniformLocation
    lightMode: WebGLUniformLocation
  }
}

const resourcesByCanvas = new WeakMap<HTMLCanvasElement, MeshResources>()

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_field;

uniform vec2 u_phase;
uniform float u_display_scale;
uniform vec2 u_field_size;
uniform vec2 u_viewport;
uniform vec2 u_camera_angles;
uniform vec4 u_camera_view;

varying float v_value;

void main() {
  float value = clamp(dot(a_field, u_phase) / u_display_scale, -1.0, 1.0);
  float height_value = value * min(u_field_size.x, u_field_size.y) * 0.12;
  float z = a_position.y - u_field_size.y * 0.5;
  float cos_yaw = cos(u_camera_angles.x);
  float sin_yaw = sin(u_camera_angles.x);
  float cos_pitch = cos(u_camera_angles.y);
  float sin_pitch = sin(u_camera_angles.y);
  float rotated_x = cos_yaw * a_position.x - sin_yaw * z;
  float yaw_depth = sin_yaw * a_position.x + cos_yaw * z;
  float rotated_y = cos_pitch * height_value - sin_pitch * yaw_depth;
  float depth = sin_pitch * height_value + cos_pitch * yaw_depth;
  float base_scale = min(u_viewport.x / u_field_size.x, u_viewport.y / u_field_size.y) * 0.78 * u_camera_view.x;
  float perspective = clamp(1.0 / (1.0 + depth / 34.0), 0.48, 1.9);
  float screen_x = u_viewport.x * 0.5 + u_camera_view.y + rotated_x * base_scale * perspective;
  float screen_y = u_viewport.y * 0.53 + u_camera_view.z - rotated_y * base_scale * perspective;
  gl_Position = vec4(screen_x / u_viewport.x * 2.0 - 1.0, 1.0 - screen_y / u_viewport.y * 2.0, clamp(depth / 40.0, -0.98, 0.98), 1.0);
  v_value = value;
}
`

const FRAGMENT_SHADER = `
precision mediump float;

uniform int u_theme;
uniform float u_line_pass;
uniform float u_light_mode;
varying float v_value;

vec3 neon(float t) {
  if (t < 0.5) return mix(vec3(71.0, 74.0, 202.0), vec3(64.0, 219.0, 255.0), t * 2.0) / 255.0;
  return mix(vec3(64.0, 219.0, 255.0), vec3(218.0, 111.0, 255.0), (t - 0.5) * 2.0) / 255.0;
}

vec3 thermal(float t) {
  if (t < 0.34) return mix(vec3(17.0, 28.0, 92.0), vec3(31.0, 190.0, 214.0), t / 0.34) / 255.0;
  if (t < 0.68) return mix(vec3(31.0, 190.0, 214.0), vec3(249.0, 203.0, 72.0), (t - 0.34) / 0.34) / 255.0;
  return mix(vec3(249.0, 203.0, 72.0), vec3(244.0, 71.0, 65.0), (t - 0.68) / 0.32) / 255.0;
}

vec3 neon_light(float t) {
  if (t < 0.5) return mix(vec3(33.0, 70.0, 163.0), vec3(120.0, 132.0, 158.0), t * 2.0) / 255.0;
  return mix(vec3(120.0, 132.0, 158.0), vec3(192.0, 71.0, 58.0), (t - 0.5) * 2.0) / 255.0;
}

vec3 thermal_light(float t) {
  if (t < 0.34) return mix(vec3(48.0, 67.0, 110.0), vec3(49.0, 89.0, 184.0), t / 0.34) / 255.0;
  if (t < 0.68) return mix(vec3(49.0, 89.0, 184.0), vec3(159.0, 118.0, 49.0), (t - 0.34) / 0.34) / 255.0;
  return mix(vec3(159.0, 118.0, 49.0), vec3(155.0, 64.0, 64.0), (t - 0.68) / 0.32) / 255.0;
}

void main() {
  if (u_line_pass > 0.5) {
    if (u_light_mode > 0.5) gl_FragColor = vec4(0.141, 0.325, 0.78, 0.3);
    else gl_FragColor = vec4(0.61, 0.93, 1.0, 0.20);
    return;
  }
  float t = clamp((v_value + 1.0) * 0.5, 0.0, 1.0);
  vec3 color;
  if (u_light_mode > 0.5) {
    if (u_theme == 1) color = thermal_light(t);
    else if (u_theme == 2) {
      float gray = (56.0 + t * 112.0) / 255.0;
      color = vec3(gray, min(1.0, gray + 6.0 / 255.0), min(1.0, gray + 12.0 / 255.0));
    } else color = neon_light(t);
    gl_FragColor = vec4(color, 0.72);
  } else {
    if (u_theme == 1) color = thermal(t);
    else if (u_theme == 2) {
      float gray = (42.0 + t * 190.0) / 255.0;
      color = vec3(gray, min(1.0, gray + 7.0 / 255.0), min(1.0, gray + 16.0 / 255.0));
    } else color = neon(t);
    gl_FragColor = vec4(color, 0.78);
  }
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

function uniform(gl: WebGLRenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name)
  if (!location) throw new Error(`Missing WebGL uniform: ${name}`)
  return location
}

function createResources(canvas: HTMLCanvasElement): MeshResources | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  })
  if (!gl) return null
  const program = createProgram(gl)
  const positionBuffer = gl.createBuffer()
  const fieldBuffer = gl.createBuffer()
  const triangleBuffer = gl.createBuffer()
  const lineBuffer = gl.createBuffer()
  if (!program || !positionBuffer || !fieldBuffer || !triangleBuffer || !lineBuffer) return null
  return {
    gl,
    program,
    positionBuffer,
    fieldBuffer,
    triangleBuffer,
    lineBuffer,
    triangleCount: 0,
    lineCount: 0,
    field: null,
    attributes: {
      position: gl.getAttribLocation(program, 'a_position'),
      field: gl.getAttribLocation(program, 'a_field'),
    },
    uniforms: {
      phase: uniform(gl, program, 'u_phase'),
      displayScale: uniform(gl, program, 'u_display_scale'),
      fieldSize: uniform(gl, program, 'u_field_size'),
      viewport: uniform(gl, program, 'u_viewport'),
      cameraAngles: uniform(gl, program, 'u_camera_angles'),
      cameraView: uniform(gl, program, 'u_camera_view'),
      theme: uniform(gl, program, 'u_theme'),
      linePass: uniform(gl, program, 'u_line_pass'),
      lightMode: uniform(gl, program, 'u_light_mode'),
    },
  }
}

function uploadField(resources: MeshResources, field: WaveField) {
  const { gl } = resources
  const positions = new Float32Array(field.real.length * 2)
  const amplitudes = new Float32Array(field.real.length * 2)
  for (let index = 0; index < field.real.length; index += 1) {
    const offset = index * 2
    positions[offset] = field.x[index]
    positions[offset + 1] = field.z[index]
    amplitudes[offset] = field.real[index]
    amplitudes[offset + 1] = field.imaginary[index]
  }

  const triangleIndices = new Uint16Array((field.rows - 1) * (field.columns - 1) * 6)
  let triangleOffset = 0
  for (let row = 0; row < field.rows - 1; row += 1) {
    for (let column = 0; column < field.columns - 1; column += 1) {
      const topLeft = row * field.columns + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + field.columns
      const bottomRight = bottomLeft + 1
      triangleIndices.set([topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft], triangleOffset)
      triangleOffset += 6
    }
  }

  const horizontalEdges = field.rows * (field.columns - 1)
  const verticalEdges = field.columns * (field.rows - 1)
  const lineIndices = new Uint16Array((horizontalEdges + verticalEdges) * 2)
  let lineOffset = 0
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns - 1; column += 1) {
      const index = row * field.columns + column
      lineIndices[lineOffset++] = index
      lineIndices[lineOffset++] = index + 1
    }
  }
  for (let column = 0; column < field.columns; column += 1) {
    for (let row = 0; row < field.rows - 1; row += 1) {
      const index = row * field.columns + column
      lineIndices[lineOffset++] = index
      lineIndices[lineOffset++] = index + field.columns
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.fieldBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, amplitudes, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.triangleBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangleIndices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.lineBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.STATIC_DRAW)
  resources.triangleCount = triangleIndices.length
  resources.lineCount = lineIndices.length
  resources.field = field
}

export function renderWaveMeshWebGL(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  field: WaveField,
  time: number,
  frequency: number,
  theme: WaveColorTheme,
  camera: WaveCamera,
) {
  let resources = resourcesByCanvas.get(canvas)
  if (!resources) {
    resources = createResources(canvas) ?? undefined
    if (!resources) return false
    resourcesByCanvas.set(canvas, resources)
  }
  if (resources.field !== field) uploadField(resources, field)

  const { gl, program, attributes, uniforms } = resources
  if (gl.isContextLost()) return false
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.useProgram(program)

  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer)
  gl.enableVertexAttribArray(attributes.position)
  gl.vertexAttribPointer(attributes.position, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.fieldBuffer)
  gl.enableVertexAttribArray(attributes.field)
  gl.vertexAttribPointer(attributes.field, 2, gl.FLOAT, false, 0, 0)

  const phase = Math.PI * 2 * frequency * time
  gl.uniform2f(uniforms.phase, Math.cos(phase), Math.sin(phase))
  gl.uniform1f(uniforms.displayScale, Math.max(field.unitAmplitudeMagnitude * 0.5, 1e-6))
  gl.uniform2f(uniforms.fieldSize, field.width, field.depth)
  gl.uniform2f(uniforms.viewport, width, height)
  gl.uniform2f(uniforms.cameraAngles, camera.yaw, camera.pitch)
  gl.uniform4f(uniforms.cameraView, camera.zoom, camera.panX, camera.panY, 0)
  gl.uniform1i(uniforms.theme, theme === 'thermal' ? 1 : theme === 'mono' ? 2 : 0)
  gl.uniform1f(uniforms.lightMode, document.documentElement.dataset.colorMode === 'light' ? 1 : 0)

  gl.uniform1f(uniforms.linePass, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.triangleBuffer)
  gl.drawElements(gl.TRIANGLES, resources.triangleCount, gl.UNSIGNED_SHORT, 0)

  gl.uniform1f(uniforms.linePass, 1)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, resources.lineBuffer)
  gl.drawElements(gl.LINES, resources.lineCount, gl.UNSIGNED_SHORT, 0)
  return true
}

export function disposeWaveMeshWebGL(canvas: HTMLCanvasElement) {
  const resources = resourcesByCanvas.get(canvas)
  if (!resources) return
  const { gl } = resources
  gl.deleteBuffer(resources.positionBuffer)
  gl.deleteBuffer(resources.fieldBuffer)
  gl.deleteBuffer(resources.triangleBuffer)
  gl.deleteBuffer(resources.lineBuffer)
  gl.deleteProgram(resources.program)
  resourcesByCanvas.delete(canvas)
}
