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
*/

const data_dir = '../../doc/_data/';
var cmap;

main();

function main() {
  const canvas = document.querySelector('#glcanvas');
  const gl = canvas.getContext('webgl');

  if (!gl) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }

  // Vertex shader program
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

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  // Collect all the info needed to use the shader program.
  // Look up which attributes our shader program is using
  // for aVertexPosition, aVertexColor and also
  // look up uniform locations.
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

  getCmap(gl);

  // Draw the scene
  // drawScene(gl, programInfo, buffers);

}

function getCmap(gl) {
  request = new XMLHttpRequest();
  request.open("GET", data_dir + 'bwr_cmap.csv', false);
  request.overrideMimeType('charset=UTF-8');
  request.overrideMimeType('charset=UTF-8');
  request.onload = function() {
    if (this.readyState == 4 && this.status == 200) {
      // split by rows, ignore header
      const rows = this.responseText.slice(
        this.responseText.indexOf("\n") + 1).split("\n");
      cmap = rows.map(row => row.split(",").map(c => parseFloat(c)));
      getFlatPositions(gl);
    }
  }
  request.send();
}

function getFlatPositions(gl) {
  var request;
  for (const ch_type of ['grad', 'mag', 'eeg']) {
    request = new XMLHttpRequest();
    request.open("GET", data_dir + ch_type + '_sensors_flat.csv', false);
    request.overrideMimeType('charset=UTF-8');
    request.onload = function() {
      if (this.readyState == 4 && this.status == 200) {
        // split by rows, ignore header
        const rows = this.responseText.slice(
          this.responseText.indexOf("\n") + 1).split("\n");
        // take 2nd and 3rd column with position data
        const positions = rows.map(row => [parseFloat(row.split(",")[1]),
                                           parseFloat(row.split(",")[2])]).flat();
        getDipoleData(gl, 0, 0, ch_type, positions);
      }
    }
    request.send();
  }
}

function getDipoleData(gl, vi, ai, ch_type, positions) {
  const request = new XMLHttpRequest();
  request.open("GET", data_dir + 'dipole_data/vi-' + vi + '_ai-' + ai +
    '.csv', false);
  request.overrideMimeType('charset=UTF-8');
  request.onload = function() {
    if (this.readyState == 4 && this.status == 200) {
        var dipole_data = this.responseText.map(val => parseFloat(val));
        initBuffers(gl, ch_type, positions, dipole_data);
    }
  }
}


function initBuffers(gl, ch_type, positions, dipole_data) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);


  var colors = 

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    color: colorBuffer,
  };
}

//
// Draw the scene.
//
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

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
