/*
Displays graphics and processes events for a dipole simulation viewer
application with a menu to change the position and orientation of the
dipole and a 3D rendered brain to see the result as well as output
panels for gradiometers, magnetometers and elecroencephalography.

Author: Alex Rockhill <aprockhill@mailbox.org>

License: BSD-3-Clause

Workflow:
  - Load colormap
  - Load brain geometry (coords and faces)
    - Display pial + subcortical surfaces in the dipole plot
  - Load dipole positions and orientations
    - Display positions in the dipole plot
  - Start in a reasonable position and orientation
    - Make a dipole arrow
    - Find acceptable x, y, z, theta, phi options
      - Update slider position and bounds
  - Load head surface geometry
  - Display head in the dipole plot
  - Load helmet geometry
  - Load sensor positions in 3D
  - Load sensor positions in 2D
  - Load head outline
  - Load solution
    - Display in the MEG 3D output plots
      needs: **cmap, helmet, sensors 3D, solution, scalp**
    - Display head underneath MEG helmet?
    - Display head in the EEG 3D output plot
      needs: **cmap, scalp, sensors 3D, solution**
    - Color 2D output plots
      needs: **cmap, outlines, sensors 2D, solution**
    - Display 3D sensor point locations (on top)
    - Display head outline (on top)
    - 2D and 3D contours?

On update:
  - Update arrow
  - Load solution
    - Update displays
  - Find acceptable x, y, z, theta, phi options
      - Update slider position and bounds

TO DO:
- static drawings
- change colors
- move camera
*/

const DELTA = 0.01;
const DELTA_ANGLE = 5;

const data_dir = '../../doc/_data/';
const n_csvs = 29;    // number of csvs to load
var loaded = 0;       // loaded data csv file counter
var data = {};        // the data from the csv files
var canvases;         // stores the canvas html elements
var gls;              // stores the WebGL plotters
var dipole_idx = 10;  // index of the current dipole
var angle_idx = 0;    // index of the current angle
var range_idxs = {};  // store allowable indices for the ranges

// WebGL info
var programInfos;
var buffers;
const vsSource = `
  attribute vec4 aVertexPosition;
  attribute vec4 aVertexColor;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  varying lowp vec4 vColor;
  void main(void) {
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vColor = aVertexColor;
  }
`;

// Fragment shader program
const fsSource = `
  varying lowp vec4 vColor;
  void main(void) {
    gl_FragColor = vColor;
  }
`;

main();

function main() {
  canvases = {'dipole': document.querySelector('#dipole_canvas'),
              'grad_3d': document.querySelector('#grad_3d_canvas'),
              'mag_3d': document.querySelector('#mag_3d_canvas'),
              'eeg_3d': document.querySelector('#eeg_3d_canvas'),
              'grad_2d': document.querySelector('#grad_2d_canvas'),
              'mag_2d': document.querySelector('#mag_2d_canvas'),
              'eeg_2d': document.querySelector('#eeg_2d_canvas')};
  gls = Object.fromEntries(
    Object.entries(canvases).map(entry =>
      [entry[0], entry[1].getContext('webgl')]));

  if (!gls['dipole']) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  // init plotting functions
  programInfos = Object.fromEntries(
    Object.entries(gls).map(entry =>
      [entry[0], initProgramInfo(entry[1])]));

  // load all the csv data files, as each one loads, it checks if it enabled a plot
  loadCsv('ch_types', 'string');
  ['angles', 'cmap', 'brain_verts', 'head_verts', 'helmet_verts',
   'sensor_locs', 'sensor_flat_locs', 'source_locs'].map(
    name => loadCsv(name, 'float'));
  ['brain_tris', 'head_tris', 'helmet_tris'].map(
    name => loadCsv(name, 'int'));
  ['grad', 'mag', 'eeg'].map(ch_type =>
    ['head', 'nose', 'ear_left', 'ear_right', 'mask_pos'].map(name =>
      loadCsv(ch_type + '_' + name + '_outlines'), 'float'));
  loadCsv('dipole_data/vi-' + dipole_idx + '_ai-' + angle_idx,
          'int', solution=true);
}

async function loadCsv(name, type, solution=false) {
  /* Load a csv file into an array of rows*/
  request = new XMLHttpRequest();
  request.open("GET", data_dir + name + '.csv', false);
  request.overrideMimeType('charset=UTF-8');
  request.onload = function() {
    if (this.readyState == 4 && this.status == 200) {
      if (solution) {
        data['solution'] = this.responseText.split("\n").map(
          val => parseInt(val));
      } else {
        // split by rows, ignore header
        const rows = this.responseText.slice(
        this.responseText.indexOf("\n") + 1).split("\n");
        if (type == 'float') {
          data[name] = rows.map(row => row.split(",").map(c => parseFloat(c)));
        } else if (type == 'int') {
          data[name] = rows.map(row => row.split(",").map(c => parseInt(c)));
        } else {
          data[name] = rows.map(row => row.split(","));
        }
        data[name] = data[name].slice(0, data[name].length - 1); // extra new line
      }
      loaded++;
      console.log('Number loaded:' + loaded + ', current: ' + name);
      if (loaded == n_csvs - 1) {
        initPlots();
      }
    }
  }
  request.send();
}

function initPlots() {
  /* Once the files are loaded, make the plots.*/
  console.log('Initalizing plots');
  updatePositionSliders();
  updateAngleSliders();
  buffers = {'brain': initBuffers3D(
    gls['dipole'], data['brain_verts'].flat(), data['brain_tris'].flat(),
    Array(data['brain_verts'].length).fill([0.5, 0.5, 0.5, 0.5]).flat())};
  draw3D(gls['dipole'], programInfos['dipole'], buffers['brain']);
}

function updatePositionSliders() {
  /* Update the position sliders with the allowed ranges based on the dipole*/
  // filter by y and z being close to the current position
  let vars = ['x', 'y', 'z'];
  let idx = [[1, 2], [0, 2], [0, 1]];
  for (var i = 0; i < vars.length; i++) {
    range_idxs[vars[i]] = [...Array(data['source_locs'].length).keys()].filter(
      j => (Math.abs(data['source_locs'][j][idx[i][0]] -
                     data['source_locs'][dipole_idx][idx[i][0]]) +
            Math.abs(data['source_locs'][j][idx[i][1]] -
                     data['source_locs'][dipole_idx][idx[i][1]])) < DELTA);
    range_idxs[vars[i]].sort((i0, i1) =>
      data['source_locs'][i0][i] - data['source_locs'][i1][i]);
    document.querySelector('#' + vars[i] + '_range').value =
      range_idxs[vars[i]].indexOf(dipole_idx);
    document.querySelector('#' + vars[i] + '_range').max = 
      range_idxs[vars[i]].length;
  }
}

function updateAngleSliders() {
  /* Update the angle sliders with the allowed ranges based on the dipole*/
  // filter angle indices by their angle being close to the current
  // find angles with the same phi
  range_idxs['theta'] = [...Array(data['angles'].length).keys()].filter(
    i => Math.abs(data['angles'][i][1] -
                  data['angles'][angle_idx][1]) < DELTA_ANGLE);
  range_idxs['theta'].sort((i0, i1) =>
    data['angles'][i0][0] - data['angles'][i1][0]);
  document.querySelector('#theta_range').value =
    range_idxs['theta'].indexOf(angle_idx);
  document.querySelector('#theta_range').max = range_idxs['theta'].length;

  // find angles with the same theta
  range_idxs['phi'] = [...Array(data['angles'].length).keys()].filter(
    i => Math.abs(data['angles'][i][0] -
                  data['angles'][angle_idx][0]) < DELTA_ANGLE);
  range_idxs['phi'].sort((i0, i1) =>
    data['angles'][i0][1] - data['angles'][i1][1]);
  var phi_idx = range_idxs['phi'].indexOf(angle_idx);
  document.querySelector('#phi_range').value =
    range_idxs['phi'].indexOf(angle_idx);
  document.querySelector('#phi_range').max = range_idxs['phi'].length;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }
  return shaderProgram;
}

function initProgramInfo(gl) {
  // Vertex shader program
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexColor: gl.getAttribLocation(shaderProgram, 'aVertexColor'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
    },
  };
  return programInfo;
}

function initBuffers3D(gl, positions, tris, colors=null) {

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

  const triBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triBuffer);

  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(tris), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    color: colorBuffer,
    indices: triBuffer,
  };
}

function initBuffers2D(gl) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  var colors = [];

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    color: colorBuffer,
  };
}

function draw3D(gl, programInfo, buffers) {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
  gl.clearDepth(1.0);                 // Clear everything
  gl.enable(gl.DEPTH_TEST);           // Enable depth testing
  gl.depthFunc(gl.LEQUAL);            // Near things obscure far things
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const fieldOfView = 45 * Math.PI / 180;   // in radians
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  mat4.perspective(projectionMatrix,
                   fieldOfView,
                   aspect,
                   zNear,
                   zFar);

  const modelViewMatrix = mat4.create();

  mat4.translate(modelViewMatrix,     // destination matrix
                 modelViewMatrix,     // matrix to translate
                 [-0.0, 0.0, -6.0]);  // amount to translate
  /*mat4.rotate(modelViewMatrix,  // destination matrix
              modelViewMatrix,  // matrix to rotate
              cubeRotation,     // amount to rotate in radians
              [0, 0, 1]);       // axis to rotate around (Z)
  mat4.rotate(modelViewMatrix,  // destination matrix
              modelViewMatrix,  // matrix to rotate
              cubeRotation * .7,// amount to rotate in radians
              [0, 1, 0]);       // axis to rotate around (X)*/

  // Tell WebGL how to pull out the positions from the position
  // buffer into the vertexPosition attribute
  {
    const numComponents = 3;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
  }

  // Tell WebGL how to pull out the colors from the color buffer
  // into the vertexColor attribute.
  {
    const numComponents = 4;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexColor,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexColor);
  }

  // Tell WebGL which indices to use to index the vertices
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.useProgram(programInfo.program);

  gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix);
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix);

  {
    const vertexCount = buffers.indices.length;
    const type = gl.UNSIGNED_SHORT;
    const offset = 0;
    gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
  }
}

function drawScene(gl, programInfo, buffers) {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
  gl.clearDepth(1.0);                 // Clear everything
  gl.enable(gl.DEPTH_TEST);           // Enable depth testing
  gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

  // Clear the canvas before we start drawing on it.

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Create a perspective matrix, a special matrix that is
  // used to simulate the distortion of perspective in a camera.
  // Our field of view is 45 degrees, with a width/height
  // ratio that matches the display size of the canvas
  // and we only want to see objects between 0.1 units
  // and 100 units away from the camera.

  const fieldOfView = 45 * Math.PI / 180;   // in radians
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const zNear = 0.1;
  const zFar = 100.0;
  const projectionMatrix = mat4.create();

  // note: glmatrix.js always has the first argument
  // as the destination to receive the result.
  mat4.perspective(projectionMatrix,
                   fieldOfView,
                   aspect,
                   zNear,
                   zFar);

  // Set the drawing position to the "identity" point, which is
  // the center of the scene.
  const modelViewMatrix = mat4.create();

  // Now move the drawing position a bit to where we want to
  // start drawing the square.

  mat4.translate(modelViewMatrix,     // destination matrix
                 modelViewMatrix,     // matrix to translate
                 [-0.0, 0.0, -6.0]);  // amount to translate

  // Tell WebGL how to pull out the positions from the position
  // buffer into the vertexPosition attribute
  {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
  }

  // Tell WebGL how to pull out the colors from the color buffer
  // into the vertexColor attribute.
  {
    const numComponents = 4;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexColor,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexColor);
  }

  // Tell WebGL to use our program when drawing

  gl.useProgram(programInfo.program);

  // Set the shader uniforms

  gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix);
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix);

  {
    const offset = 0;
    const vertexCount = 4;
    gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
  }
}
