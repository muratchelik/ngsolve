var scene, renderer, camera, mesh;
var clipping_plane;
var three_clipping_plane;
var world_clipping_plane;
var light_dir;

var container, stats;

var uniforms = {};
var gui_status_default = {
  eval: 0,
  subdivision: 5,
  edges: true,
  elements: true,
  colormap_ncolors: 8,
  colormap_min: 0,
  colormap_max: 1.0,
  deformation: 0.0,
  Complex: { phase: 0.0, deform: 0.0, animate: false, speed: 0.01 },
  Clipping: { enable: false, function: true, x: 0.0, y: 0.0, z: 1.0, dist: 0.0 },
  Light: { ambient: 0.3, diffuse: 0.7, shininess: 10, specularity: 0.3},
  Vectors: { show: false, grid_size: 10, offset: 0.0 },
  Misc: { stats: "-1", reduce_subdivision: false },
};
var gui_status = JSON.parse(JSON.stringify(gui_status_default)); // deep-copy settings
var gui_functions = { };
var phase_controller;

var wireframe_object;
var mesh_object;
var clipping_function_object;
var clipping_vectors_object;
var controls, controls2;

var have_webgl2 = false;

var websocket = null;

var buffer_scene;
var buffer_object;
var buffer_texture;
var buffer_camera;

var mesh_center;
var mesh_radius;

var pivot;

var label_style  = '-moz-user-select: none; -webkit-user-select: none; -ms-user-select:none; onselectstart="return false;';
label_style += 'onmousedown="return false; user-select:none;-o-user-select:none;unselectable="on";';
label_style += 'position: absolute; z-index: 100; display:block;';

function readB64(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return new Float32Array( bytes.buffer );
}

function setKeys (dst, src) {
  for(var key in dst) {
    if(typeof(dst[key])=="object" && src[key] !== undefined)
      setKeys(dst[key], src[key]);
    else
    {
      dst[key] = src[key];
    }
  }
}

function setGuiSettings (settings) {
  setKeys(gui_status, settings);
  stats.showPanel(parseInt(gui_status.Misc.stats));
  for (var i in gui.__controllers)
  gui.__controllers[i].updateDisplay();
  for (var f in gui.__folders) {
    const folder = gui.__folders[f];
    for (var i in folder.__controllers)
      folder.__controllers[i].updateDisplay();
  }
  animate();
}

var CameraControls = function (cameraObject, pivotObject, domElement) {
  if ( domElement === undefined ) console.log( 'domElement is undefined' );
	if ( domElement === document ) console.error( '"document" should not be used as the target "domElement". Please use "renderer.domElement" instead.' );
  if ( !cameraObject.isPerspectiveCamera ) console.error('camera must be perspective camera');

  this.cameraObject = cameraObject;
  this.pivotObject = pivotObject;
  this.domElement = domElement;

  this.transmat = new THREE.Matrix4();
  this.rotmat = new THREE.Matrix4();
  this.centermat = new THREE.Matrix4();
  this.transformationmat = new THREE.Matrix4();
  this.scale = 1.0/mesh_radius;

  this.centermat.makeTranslation(-mesh_center.x, -mesh_center.y, -mesh_center.z);

  this.mode = null;

  this.keys = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, CLOCKWISE: 65, COUNTERCLOCKWISE: 83};

  this.rotation_step_degree = 0.05;
  this.pan_step = 0.05;
  this.camera_step = 0.2;

  // not to change from outside
  var changeEvent = { type: 'change' };

  var scope = this;
  
  this.reset = function () {
    scope.transmat.identity();
    scope.rotmat.identity();
    scope.centermat.identity();
    scope.transformationmat.identity();
    scope.scale = 1.0/mesh_radius;
    scope.centermat.makeTranslation(-mesh_center.x, -mesh_center.y, -mesh_center.z);
    scope.update();
  }

  this.update = function () {
    var scale_vec = new THREE.Vector3();
    return function update() {
      scale_vec.setScalar(scope.scale);
      scope.pivotObject.matrix.copy(scope.transmat).multiply(scope.rotmat).scale(scale_vec).multiply(scope.centermat);
      scope.dispatchEvent( changeEvent );
    };  
  }()

  this.rotateObject = function () {
    var mat = new THREE.Matrix4();
    return function(axis, rad) {
      mat.makeRotationAxis(axis, rad);
      scope.rotmat.premultiply(mat);
    };
  }();  

  this.panObject = function () {
    var mat = new THREE.Matrix4();
    return function(dir, dist) {
      mat.makeTranslation(dist*dir.x, dist*dir.y, dist*dir.z);
      scope.transmat.premultiply(mat);
    };
  }();  

  function keydown(event) {
    var needs_update = false;
    // TODO:  should a moving camera be allowed? 
    if (event.shiftKey){ // pan
      if (event.keyCode == scope.keys.DOWN) {
        needs_update = true;
        scope.panObject(new THREE.Vector3(0, -1, 0), scope.pan_step)
      } else if (event.keyCode == scope.keys.UP) {
        needs_update = true;
        scope.panObject(new THREE.Vector3(0, 1, 0), scope.pan_step)
      } else if (event.keyCode == scope.keys.LEFT) {
        needs_update = true;
        scope.panObject(new THREE.Vector3(-1, 0, 0), scope.pan_step)
      } else if (event.keyCode == scope.keys.RIGHT) {
        needs_update = true;
        scope.panObject(new THREE.Vector3(1, 0, 0), scope.pan_step)
      } 
  
    } else { // rotate
      if (event.keyCode == scope.keys.DOWN) {
        needs_update = true;
        scope.rotateObject(new THREE.Vector3(1, 0, 0), scope.rotation_step_degree)
      } else if (event.keyCode == scope.keys.UP) {
        needs_update = true;
        scope.rotateObject(new THREE.Vector3(-1, 0, 0), scope.rotation_step_degree)
      } else if (event.keyCode == scope.keys.LEFT) {
        needs_update = true;
        scope.rotateObject(new THREE.Vector3(0, -1, 0), scope.rotation_step_degree)
      } else if (event.keyCode == scope.keys.RIGHT) {
        needs_update = true;
        scope.rotateObject(new THREE.Vector3(0, 1, 0), scope.rotation_step_degree)
      } else if (event.keyCode == scope.keys.CLOCKWISE) {
        needs_update = true;
        scope.rotateObject(new THREE.Vector3(0, 0, 1), scope.rotation_step_degree)
      } else if (event.keyCode == scope.keys.COUNTERCLOCKWISE) {
        needs_update = true;
        scope.rotateObject(new THREE.Vector3(0, 0, -1), scope.rotation_step_degree)
      } 
    }

    if(needs_update) {
      event.preventDefault();
      scope.update();
    }

  }

    function onMouseDown(event) {
        if(event.button==0) {
            event.preventDefault();
            scope.mode = "rotate";
        }
        if(event.button==2) {
            event.preventDefault();
            scope.mode = "move";
        }
        event.stopPropagation();
    }

  function onMouseUp(event) {
    scope.mode = null;
    scope.dispatchEvent( changeEvent );
  }

  function onMouseMove(event) {
    var needs_update = false;

    if(scope.mode=="rotate")
    {
      needs_update = true;
      scope.rotateObject(new THREE.Vector3(1, 0, 0), 0.01*event.movementY);
      scope.rotateObject(new THREE.Vector3(0, 1, 0), 0.01*event.movementX);
    }

    if(scope.mode=="move")
    {
      needs_update = true;
      scope.panObject(new THREE.Vector3(1, 0, 0), 0.004*event.movementX);
      scope.panObject(new THREE.Vector3(0, -1, 0), 0.004*event.movementY);
    }

    if(needs_update) {
      event.preventDefault();
      scope.update();
    }
  }


  function wheel(event) {
    event.preventDefault();
    event.stopPropagation();

    var s = Math.exp(-0.001*event.deltaY);
    scope.scale *=  s ;
    scope.update();
  }
    
    function contextmenu( event ) {
        event.preventDefault();
    }
    
    
    // scope.domElement.addEventListener( 'mouseup', onMouseUp, false );
    window.addEventListener( 'mouseup', onMouseUp, false );
    scope.domElement.addEventListener( 'mousedown', onMouseDown, false );
    scope.domElement.addEventListener( 'contextmenu', contextmenu, false );
    window.addEventListener( 'mousemove', onMouseMove, false );

  window.addEventListener( 'keydown', keydown, false );
  scope.domElement.addEventListener( 'wheel', wheel, false );


	// make sure element can receive keys.

	if ( scope.domElement.tabIndex === - 1 ) {

		scope.domElement.tabIndex = 0;

	}

  this.reset();
};

CameraControls.prototype = Object.create( THREE.EventDispatcher.prototype );
CameraControls.prototype.constructor = CameraControls;

function updateClippingPlaneCamera()
{
  const n = gui_status.Vectors.grid_size;
  var plane_center = new THREE.Vector3();
  three_clipping_plane.projectPoint(mesh_center, plane_center);
  var plane0 = three_clipping_plane.clone();
  plane0.constant = 0.0;
  const normal = three_clipping_plane.normal;


  var t2 = new THREE.Vector3();
  if(normal.z<0.5)
    plane0.projectPoint(new THREE.Vector3(0,0,1), t2);
  else if(normal.y<0.5)
    plane0.projectPoint(new THREE.Vector3(0,1,0), t2);
  else
    plane0.projectPoint(new THREE.Vector3(1,0,0), t2);

  var t1 = new THREE.Vector3().crossVectors(t2, plane0.normal);
  t1.setLength(2*mesh_radius/n);
  t2.setLength(2*mesh_radius/n);

  var position = plane_center.clone();
  position.addScaledVector(plane0.normal, 1);
  var target = plane_center.clone();
  target.addScaledVector(plane0.normal, -1);

  buffer_camera.position.copy(position);
  buffer_camera.up = t2;
  buffer_camera.lookAt(target);
  buffer_camera.updateProjectionMatrix();
  buffer_camera.updateMatrix();

  uniforms.clipping_plane_c.value = plane_center;
  uniforms.clipping_plane_t1.value = t1;
  uniforms.clipping_plane_t2.value = t2;
  uniforms.grid_size.value = n;

  const geo = clipping_vectors_object.geometry;
  var arrowid = new Float32Array(2*n * n);
  for(var i=0; i<n; i++)
    for(var j=0; j<n; j++) {
      arrowid[2*(i*n + j)+0] = 1.0*(j+0.5)/n;
      arrowid[2*(i*n + j)+1] = 1.0*(i+0.5)/n;
    }
  geo.maxInstancedCount = n*n;
  geo.setAttribute( 'arrowid', new THREE.InstancedBufferAttribute( arrowid, 2 ) );
}

function updateGridsize()
{
  const n = gui_status.Vectors.grid_size;
  buffer_texture = new THREE.WebGLRenderTarget( n, n, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, format: THREE.RGBAFormat });
  uniforms.tex_values = new THREE.Uniform(buffer_texture.texture);
  buffer_camera = new THREE.OrthographicCamera( -mesh_radius, mesh_radius, mesh_radius, -mesh_radius, -10, 10 );
  animate();
}

function init () {
  console.log("init");
  mesh_center = new THREE.Vector3().fromArray(render_data.mesh_center);
  mesh_radius = render_data.mesh_radius;
    if (render_data.websocket_url)
      websocket = new WebSocket(render_data.websocket_url);
    var canvas = document.createElement( 'canvas' );

    // console.log ("browser="+window.navigator.userAgent);
    var gl2 = canvas.getContext('webgl2');
    console.log("THREE", THREE);

    if (gl2) {
        console.log('webgl2 is supported!');
        var context = canvas.getContext( 'webgl2', { alpha: false } );
        have_webgl2 = true;
    }
    else
    {
        console.log('your browser/OS/drivers do not support WebGL2');
        var context = canvas.getContext( { alpha: false } );
    }

    renderer = new THREE.WebGLRenderer( { canvas: canvas, context: context } );
    console.log("Renderer", renderer);


  //this is to get the correct pixel detail on portable devices
  renderer.setPixelRatio( window.devicePixelRatio );
  // renderer.domElement.addEventListener("click", console.log, true)

  //and this sets the canvas' size.
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setClearColor( 0xffffff, 1 );

  container = document.createElement( 'div' );
  document.body.appendChild( container );

  container.appendChild( renderer.domElement );

  stats = new Stats();
  stats.showPanel(-1); // Panel -1 = hidden, 0 = fps, 1 = ms per frame, 2 = memory usage
  stats.domElement.style.cssText = 'position:absolute;top:0px;left:0px;';
  container.appendChild( stats.domElement );

  // label with NGSolve version at right lower corner
  var version_div = document.createElement("div");
  style = 'bottom: 10px; right: 10px';
  version_div.setAttribute("style",label_style+style);
  var version_text = document.createTextNode("NGSolve " + render_data.ngsolve_version);
  version_div.appendChild(version_text)
  container.appendChild(version_div);


  scene = new THREE.Scene();
  // var axesHelper_scene = new THREE.AxesHelper(10);
  // scene.add(axesHelper_scene);

  pivot = new THREE.Group();
  pivot.matrixAutoUpdate = false;
  // var axesHelper_pivot = new THREE.AxesHelper( 1 );
  // pivot.add(axesHelper_pivot);

  buffer_scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    40,                                         //FOV
    window.innerWidth / window.innerHeight,     //aspect
    1,                                          //near clipping plane
    100                                         //far clipping plane
  );

    camera.position.set( 0.0, 0.0, 3 );
    var camera_init = new THREE.Vector3();
    camera.localToWorld(camera_init);
    console.log("camera init", camera_init);
    // should we compute center point on server or client ? (JS)
    // EDIT: temporarily done on server
    // scene.translateX(-mesh_center[0]).translateY(-mesh_center[1]).translateZ(-mesh_center[2]);

  window.addEventListener( 'resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    animate();
  }, false );

//   controls2 = new THREE.OrbitControls (camera, renderer.domElement);
//   controls2.enabled = true;
//   controls2.enableKeys = false;
//   controls2.enableZoom = true;
//   controls2.enablePan = false;  
  clipping_plane = new THREE.Vector4(0,0,1,0);
  uniforms.clipping_plane = new THREE.Uniform( clipping_plane ); 
  /* should cliping plane in pivot world be calculated in shader insted of passing it? 
    currently not done because it is needed here anyways
  */
  three_clipping_plane  = new THREE.Plane( );

  light_dir = new THREE.Vector3(0.5,0.5,1.5);
  light_dir.normalize();
  uniforms.light_dir = new THREE.Uniform(light_dir);
  var light_mat = new THREE.Vector4(0.3, 0.7, 10, 0.3); // ambient, diffuse, shininess, specularity
  uniforms.light_mat = new THREE.Uniform(light_mat);

  uniforms.do_clipping = new THREE.Uniform( false );

  gui = new dat.GUI();
  console.log("GUI", gui);

  if(render_data.show_wireframe)
  {
    wireframe_object = createCurvedWireframe(render_data);
    pivot.add(wireframe_object);
    uniforms.n_segments = new THREE.Uniform(5);
    gui.add(gui_status, "subdivision", 1,20,1).onChange(animate);
    gui.add(gui_status, "edges").onChange(animate);
  }

  if(render_data.show_mesh)
  {
      mesh_object = createCurvedMesh(render_data);
      pivot.add( mesh_object );
      gui.add(gui_status, "elements").onChange(animate);
  }


  if(render_data.is_complex)
  {
    gui_status_default.eval = 5;
    gui_status.eval = 5;
    gui.add(gui_status, "eval", {"real": 5,"imag":6,"norm":7}).onChange(animate);

    cgui = gui.addFolder("Complex");
    phase_controller = cgui.add(gui_status.Complex, "phase", 0, 2*Math.PI, 0.001).onChange(animate);
    cgui.add(gui_status.Complex, "animate").onChange(animate);
    cgui.add(gui_status.Complex, "speed", 0.0, 1, 0.0001).onChange(animate);
    if(render_data.mesh_dim==2)
      cgui.add(gui_status.Complex, "deform", 0.0, 1, 0.001).onChange(animate);
    uniforms.complex_scale = new THREE.Uniform( new THREE.Vector2(1, 0) );
    uniforms.complex_deform = new THREE.Uniform( 0.0 );
  }
  else if(render_data.funcdim>1)
    gui.add(gui_status, "eval", {"0": 0,"1":1,"2":2,"norm":3}).onChange(animate);


  if(render_data.mesh_dim == 3)
  {
    gui_clipping = gui.addFolder("Clipping");
    if(render_data.show_clipping_function)
    {
      gui_clipping.add(gui_status.Clipping, "function").onChange(animate);

      clipping_function_object = createClippingPlaneMesh(render_data);
      pivot.add(clipping_function_object);
    }

    gui_clipping.add(gui_status.Clipping, "enable").onChange(animate);
    gui_clipping.add(gui_status.Clipping, "x", -1.0, 1.0).onChange(animate);
    gui_clipping.add(gui_status.Clipping, "y", -1.0, 1.0).onChange(animate);
    gui_clipping.add(gui_status.Clipping, "z", -1.0, 1.0).onChange(animate);
    gui_clipping.add(gui_status.Clipping, "dist", -3.0, 3.0).onChange(animate);
  }

  uniforms.function_mode = new THREE.Uniform( 0 );
  if(render_data.funcdim>1)
  {
    uniforms.deformation = new THREE.Uniform( gui_status.deformation );
    gui.add(gui_status, "deformation", 0.0, 1.0, 0.0001).onChange(animate);

    gui_vec = gui.addFolder("Vectors");
    gui_vec.add(gui_status.Vectors, "show").onChange(animate);
    gui_vec.add(gui_status.Vectors, "grid_size", 1, 100, 1).onChange(updateGridsize);
    gui_vec.add(gui_status.Vectors, "offset", -1.0, 1.0, 0.001).onChange(animate);

    if(render_data.mesh_dim==2)
      buffer_object = mesh_object.clone();
    else
      buffer_object = clipping_function_object.clone();

    buffer_scene.add(buffer_object);

    uniforms.clipping_plane_c = new THREE.Uniform( new THREE.Vector3() );
    uniforms.clipping_plane_t1 = new THREE.Uniform( new THREE.Vector3() );
    uniforms.clipping_plane_t2 = new THREE.Uniform( new THREE.Vector3() );
    uniforms.vectors_offset = new THREE.Uniform( gui_status.Vectors.offset );
    uniforms.grid_size = new THREE.Uniform( gui_status.Vectors.grid_size );

    clipping_vectors_object = createClippingVectors(render_data);
    pivot.add(clipping_vectors_object);
    updateGridsize();
  }

//   controls2.target.set(0.0, 0.0, 0.0);
//   controls2.update();
//   controls2.addEventListener('change', animate );

  if(render_data.show_clipping_function || render_data.show_surface_function)
  {
    const cmin = render_data.funcmin;
    const cmax = Math.abs(render_data.funcmax);
    gui_status.colormap_min = cmin;
    gui_status.colormap_max = cmax;
    gui_status_default.colormap_min = cmin;
    gui_status_default.colormap_max = cmax;

    const cstep = 1e-6 * (cmax-cmin);
    gui.add(gui_status, "colormap_min", cmin, 2*cmax, cstep).onChange(animate);
    gui.add(gui_status, "colormap_max", cmin, 2*cmax, cstep).onChange(animate);

    gui.add(gui_status, "colormap_ncolors", 2, 32,1).onChange(updateColormap);
  }
  uniforms.colormap_min = new THREE.Uniform( gui_status.colormap_min );
  uniforms.colormap_max = new THREE.Uniform( gui_status.colormap_max );
  updateColormap();

  gui_light = gui.addFolder("Light");
  gui_light.add(gui_status.Light, "ambient", 0.0, 1.0).onChange(animate);
  gui_light.add(gui_status.Light, "diffuse", 0.0, 1.0).onChange(animate);
  gui_light.add(gui_status.Light, "shininess", 0.0, 100.0).onChange(animate);
  gui_light.add(gui_status.Light, "specularity", 0.0, 1.0).onChange(animate);

  gui_misc = gui.addFolder("Misc");
  gui_misc.add(gui_status.Misc, "stats", {"none":-1, "FPS":0, "ms":1, "memory":2}).onChange(function(show_fps) {
      stats.showPanel( parseInt(show_fps) );
  });
  gui_functions['reset settings'] = function() {
    setGuiSettings(gui_status_default);
  };
  gui_functions['store settings'] = function() {
    document.cookie = "gui_status="+btoa(JSON.stringify(gui_status));
  };
  gui_functions['load settings'] = function() {
    var name = "gui_status="
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
      var c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        const s = JSON.parse(atob(c.substring(name.length, c.length)));
        setGuiSettings(s);
      }
    }
  };
  gui_misc.add(gui_functions, "reset settings");
  gui_misc.add(gui_functions, "store settings");
  gui_misc.add(gui_functions, "load settings");

  gui_misc.add(gui_status.Misc, "reduce_subdivision");

  gui_functions['center'] = function() {
    controls.reset();
  };
  gui.add(gui_functions, "center").onChange(animate);

// pivot.translateX(-mesh_center.x);
// pivot.translateY(-mesh_center.y);
// pivot.translateZ(-mesh_center.z);
scene.add( pivot );

controls = new CameraControls(camera, pivot, renderer.domElement );
controls.addEventListener('change', animate);

  animate();
}

function getShader(name, defines)
{
  defines = {...defines}; // copy dictionary
  if(name.endsWith(".vert"))
    defines["VERTEX_SHADER"] = true;
  if(name.endsWith(".frag"))
    defines["FRAGMENT_SHADER"] = true;
  var s ="";
  for(var key in defines)
    s += "#define " + key + " " + defines[key] + "\\n"

  var utils = document.getElementById( 'utils.h' ).textContent.trim();
  var shader = document.getElementById( name ).textContent.trim();
  return s + "// START FILE: utils.h \\n" + utils +'\\n// START FILE: ' + name + "\\n" + shader;
}

function updateColormap( )
{
  n_colors = gui_status.colormap_ncolors;
  var colormap_data = new Float32Array(4*n_colors);

  var col_blue = new THREE.Vector3(0,0,1);
  var col_cyan = new THREE.Vector3(0,1,1);
  var col_green = new THREE.Vector3(0,1,0);
  var col_yellow = new THREE.Vector3(1,1,0);
  var col_red = new THREE.Vector3(1,0,0);

  for (var i=0; i<n_colors; i++)
  {
    x = 1.0/(n_colors-1) * i;
    if (x < 0.25)
    {
      hx = 4.0*x;
      color = col_blue.clone().multiplyScalar(1.0-hx).addScaledVector(col_cyan, hx);
    }
    else if (x < 0.5)
    {
      hx = 4.0*x-1.0;
      color = col_cyan.clone().multiplyScalar(1.0-hx).addScaledVector(col_green, hx);
    }
    else if (x < 0.75)
    {
      hx = 4.0*x-2.0;
      color = col_green.clone().multiplyScalar(1.0-hx).addScaledVector(col_yellow, hx);
    }
    else
    {
      hx = 4.0*x-3.0;
      color = col_yellow.clone().multiplyScalar(1.0-hx).addScaledVector(col_red, hx);
    }
    colormap_data[3*i+0] = color.x;
    colormap_data[3*i+1] = color.y;
    colormap_data[3*i+2] = color.z;
  }

  var colormap_texture = new THREE.DataTexture( colormap_data, n_colors, 1, THREE.RGBFormat, THREE.FloatType );
  colormap_texture.magFilter = THREE.NearestFilter;
  colormap_texture.needsUpdate = true;
  uniforms.tex_colormap = { value: colormap_texture};

  animate();
}

function createCurvedMesh(data)
{
    var geo = new THREE.InstancedBufferGeometry();
    var position = new Float32Array(6*20*20); // 20*20 triangles

    // subdivision mesh
    var ii = 0;
    for (var i=0; i<20; i++) {
        for (var j=0; j<=i; j++) {
            position[ii++] = j;
            position[ii++] = i-j;
            position[ii++] = j+1;
            position[ii++] = i-j;
            position[ii++] = j;
            position[ii++] = i-j+1;
        }
        for (var j=0; j<i; j++) {
            position[ii++] = j+1;
            position[ii++] = i-j-1;
            position[ii++] = j+1;
            position[ii++] = i-j;
            position[ii++] = j;
            position[ii++] = i-j;
        }
    }

    var updateSolution = function( data ) {
            var i = 0;
            const order = render_data.order2d;
            var names;

            if(order == 1) {
              names = ['p0', 'p1', 'p2']
              if(render_data.funcdim>1)
                names = names.concat(['v0', 'v1', 'v2' ]);
            }
            if(order == 2) {
              names = ['p00', 'p01', 'p02', 'p10', 'p11', 'p20'];
              if(render_data.funcdim>1)
                names = names.concat([ 'vec00_01', 'vec02_10', 'vec11_20' ]);
            }
            if(order == 3) {
              names = [ 'p00', 'p01', 'p02', 'p03', 'p10', 'p11', 'p12', 'p20', 'p21', 'p30'];
              if(render_data.funcdim>1)
                names = names.concat([ 'vec00_01', 'vec02_03', 'vec10_11', 'vec12_20', 'vec21_30']);
            }

            for (var i in names)
              geo.setAttribute( names[i], new THREE.InstancedBufferAttribute( readB64(data[i]), 4 ) );
            animate();
    }
    updateSolution(render_data.Bezier_trig_points);

    if(websocket != null)
    {
      websocket.onmessage = async function(ev) {
        fr = new FileReader();
        fr.onload = function() {
          updateSolution(JSON.parse(this.result));
        };
        fr.readAsText(ev.data);
      };
    }

    geo.setAttribute( 'position', new THREE.Float32BufferAttribute(position, 2 ));
    geo.boundingSphere = new THREE.Sphere(mesh_center, mesh_radius);
    
    const defines = {MESH_2D: true, ORDER:render_data.order2d};
    var wireframe_material = new THREE.RawShaderMaterial({
        vertexShader: getShader( 'trigsplines.vert', defines ),
        fragmentShader: getShader( 'function.frag', defines ),
        side: THREE.DoubleSide,
        uniforms: uniforms
    });
    var mesh = new THREE.Mesh( geo, wireframe_material );
    return mesh;
}


function createCurvedWireframe(data)
{
    const n_verts = render_data.Bezier_points[0].length/3/4*3/4; // 3 components, 3/4 b64 ratio, 4 bytes per float
    var geo = new THREE.InstancedBufferGeometry();

    var inst = new Float32Array(21); // 20 = max value of n_segments
    for (var i=0; i <= 20; i++)
        inst[i] = i;

    geo.setAttribute( 'position', new THREE.Float32BufferAttribute( inst, 1 ));
    geo.setAttribute( 'p0', new THREE.InstancedBufferAttribute( readB64( render_data.Bezier_points[0]), 3 ));
    geo.setAttribute( 'p1', new THREE.InstancedBufferAttribute( readB64( render_data.Bezier_points[1]), 3 ));
    if(render_data.order2d >= 2)
        geo.setAttribute( 'p2', new THREE.InstancedBufferAttribute( readB64( render_data.Bezier_points[2]), 3 ));
    if(render_data.order2d >= 3)
        geo.setAttribute( 'p3', new THREE.InstancedBufferAttribute( readB64( render_data.Bezier_points[3]), 3 ));

    geo.maxInstancedCount = n_verts;
    geo.boundingSphere = new THREE.Sphere(mesh_center, mesh_radius);
    
    const defines = {ORDER: render_data.order2d};
    var wireframe_material = new THREE.RawShaderMaterial({
        vertexShader: getShader( 'splines.vert', defines ),
        fragmentShader: getShader( 'splines.frag', defines ),
        uniforms: uniforms
    });

    var wireframe = new THREE.Line( geo, wireframe_material );
    return wireframe;
}


function createClippingVectors(data)
{
    var material = new THREE.RawShaderMaterial({
        vertexShader: getShader( 'vector_function.vert' ),
        fragmentShader: getShader( 'function.frag', {NO_CLIPPING: 1}),
        side: THREE.DoubleSide,
        uniforms: uniforms
    });


  const geo = new THREE.InstancedBufferGeometry().fromGeometry(new THREE.ConeGeometry(0.5, 1, 10));
    var mesh = new THREE.Mesh(geo, material);
    return mesh;
}

function createClippingPlaneMesh(data)
{
   const defines = {ORDER: render_data.order3d, SKIP_FACE_CHECK: 1, NO_CLIPPING: 1};
    var material = new THREE.RawShaderMaterial({
        vertexShader: getShader( 'clipping_vectors.vert', defines ),
        fragmentShader: getShader( 'function.frag', defines ),
        side: THREE.DoubleSide,
        uniforms: uniforms
    });


    const sd = 20;    // with texture: only 10
    const nverts = 6*sd*sd*sd;
    var vertid = new Float32Array(4*nverts);
    const D = render_data.funcdim;

    var ii = 0;
    var kk = 0;
    for (var i=0; i<sd; i++) {

      for (var j=0; j<=i; j++) {
          for (var k=0; k<=i-j; k++) {
              for (var l = 0; l < 6; l++) {
                  vertid[4*kk+0] = 0*6 + l;
                  vertid[4*kk+1] = j;
                  vertid[4*kk+2] = k;
                  vertid[4*kk+3] = i-j-k;
                  kk++;
              }
          }
        }
        
      for (var j=0; j<=i-1; j++) {
          for (var k=0; k<=i-1-j; k++) {
              for (var m = 0; m < 4; m++)
                  for (var l = 0; l < 6; l++) {
                      vertid[4*kk+0] = (m+1)*6 + l;                    
                      vertid[4*kk+1] = j;
                      vertid[4*kk+2] = k;
                      vertid[4*kk+3] = i-j-k-1;
                      kk++;
                  }
          }
      }
        
      // with i>2 hexes fit into subdivided tets, add tet with point (1,1,1) in hex
      for (var j=0; j<=i-2; j++) {
        for (var k=0; k<=i-2-j; k++) {
            for (var l = 0; l < 6; l++) {
                vertid[4*kk+0] = 5*6 + l;                                    
                vertid[4*kk+1] = j+1;
                vertid[4*kk+2] = k+1;
                vertid[4*kk+3] = i-1-j-k;
                kk++;
            }

        }
      }

    }

    var geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute( 'position', new THREE.Float32BufferAttribute( vertid, 4 ));
    geo.setAttribute( 'vertid',   new THREE.Float32BufferAttribute( vertid, 4 ));

    var names = [ 'p0', 'p1', 'p2', 'p3' ];
    if(render_data.order3d==2)
      names = names.concat(['p03', 'p13', 'p23', 'p01', 'p02', 'p12' ]);

    if(render_data.funcdim>1)
    {
      names = names.concat(['v0_1', 'v2_3']);
      if(render_data.order3d==2)
        names = names.concat(['v03_13', 'v23_01', 'v02_12']);
    }

    for (var i in names)
      geo.setAttribute( names[i], new THREE.InstancedBufferAttribute( readB64(render_data.points3d[i]), 4 ) );

    mesh = new THREE.Mesh( geo, material );

    return mesh;
}

var requestId = 0;
function animate () {
  // Don't request a frame if another one is currently in the pipeline
  if(requestId == 0)
    requestId = requestAnimationFrame( render );

  stats.update();
}

function render() {
  requestId = 0;
  var subdivision = gui_status.subdivision;
  if(gui_status.Misc.reduce_subdivision && controls.mode != null)
    subdivision = Math.ceil(subdivision/2);
  
  if( wireframe_object != null )
  {
    wireframe_object.visible = gui_status.edges;
    if(gui_status.subdivision !== undefined)
    {
      uniforms.n_segments.value = subdivision;
      wireframe_object.geometry.setDrawRange(0, subdivision+1)
    }
  }

  if( mesh_object != null )
    {
        mesh_object.visible = gui_status.elements;
        if(gui_status.subdivision !== undefined)
        {
            uniforms.n_segments.value = subdivision;
            mesh_object.geometry.setDrawRange(0, 3*subdivision*subdivision)
        }
    }


  if( clipping_function_object != null )
  {
    uniforms.n_segments.value = subdivision;
    const sd = subdivision;
    clipping_function_object.geometry.setDrawRange(0, 6*sd*sd*sd)
    clipping_function_object.visible = gui_status.Clipping.function && gui_status.Clipping.enable;
  }

  three_clipping_plane.normal.set(gui_status.Clipping.x, gui_status.Clipping.y, gui_status.Clipping.z);
  three_clipping_plane.normal.normalize();
  three_clipping_plane.constant = gui_status.Clipping.dist; // -three_clipping_plane.normal.dot(mesh_center);

  // console.log("three_clipping_plane normal and const", three_clipping_plane.normal, three_clipping_plane.constant);

  clipping_plane.set(
    three_clipping_plane.normal.x,
    three_clipping_plane.normal.y,
    three_clipping_plane.normal.z,
    three_clipping_plane.constant);
  renderer.clippingPlanes = [];

  world_clipping_plane = three_clipping_plane.clone();

  world_clipping_plane.constant = gui_status.Clipping.dist;
  world_clipping_plane.applyMatrix4( pivot.matrix)
  // console.log("world_clipping_plane.normal and dist", world_clipping_plane.normal, world_clipping_plane.constant);

  uniforms.do_clipping.value = gui_status.Clipping.enable;

  if(render_data.funcdim>1)
    uniforms.deformation.value = gui_status.deformation;

  if(gui_status.Clipping.enable)
    renderer.clippingPlanes = [world_clipping_plane];

  if(gui_status.colormap_ncolors)
  {
    uniforms.colormap_min.value = gui_status.colormap_min;
    uniforms.colormap_max.value = gui_status.colormap_max;
  }

  if(clipping_vectors_object != null)
  {
    clipping_vectors_object.visible = gui_status.Vectors.show;
    uniforms.vectors_offset.value = gui_status.Vectors.offset;
  }

  if(render_data.is_complex)
  {
    uniforms.complex_scale.value.x = Math.cos(gui_status.Complex.phase);
    uniforms.complex_scale.value.y = Math.sin(gui_status.Complex.phase);
    if(render_data.mesh_dim==2)
      uniforms.complex_deform.value = gui_status.Complex.deform;
  }

  if(gui_status.Vectors.show)
  {
    updateClippingPlaneCamera();
    uniforms.function_mode.value = 4;
    renderer.setRenderTarget(buffer_texture);
    renderer.setClearColor( new THREE.Color(0.0,0.0,0.0) );
    renderer.render(buffer_scene, buffer_camera);
  }


  uniforms.function_mode.value = parseInt(gui_status.eval);
  uniforms.light_mat.value.x = gui_status.Light.ambient;
  uniforms.light_mat.value.y = gui_status.Light.diffuse;
  uniforms.light_mat.value.z = gui_status.Light.shininess;
  uniforms.light_mat.value.w = gui_status.Light.specularity;

  renderer.setClearColor( new THREE.Color(1.0,1.0,1.0));
  renderer.setRenderTarget(null);
  renderer.render( scene, camera );

  if(gui_status.Complex.animate)
  {
    gui_status.Complex.phase += gui_status.Complex.speed;
    if(gui_status.Complex.phase>2*Math.PI)
      gui_status.Complex.phase -= 2*Math.PI;

    phase_controller.updateDisplay();
    animate();
  }
}

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}


init();
