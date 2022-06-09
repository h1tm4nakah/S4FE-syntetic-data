import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GUI } from 'dat.gui'

let state = "start"

let controller = new function() {
	this.showPaths = false;
	this.biDirectional = true;
	this.pathNoise = 70;
	this.numAgents = 50;
	this.agentsSpeed = 141;
	this.agentsSpeedDeviation = this.agentsSpeed / 5;
	this.agentsSpeedIsLinear = true;
	this.FPS = 10;
	this.pathPoints = 5;
	this.showMasterPaths = false;
	this.planeWidth = 2000;
	this.planeHeight = 1200;
	this.cameraWidth = 600;
	this.cameraHeight = 400;
	this.spawnDuration = 100;
};

let clock = new THREE.Clock();
let delta = 0;
let deltaResidual = 0;
let interval = 1 / controller.FPS;

let camera, scene, renderer, transformControl;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let plane;
let gui;

let agentsArray = [];
let masterPathsArray = [];
let camerasArray = [];

var elapsedTime = 0;

const cubeGeometry = new THREE.BoxGeometry(10, 10, 10);
const cubeMaterial = new THREE.MeshBasicMaterial( {color: 0xffffff} );

class App {

	init() {

		camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
		camera.position.set(0, 250, 1000);

		scene = new THREE.Scene();
		scene.background = new THREE.Color( 0xffffff );

		const planeGeometry = new THREE.PlaneGeometry(1, 1);
		planeGeometry.rotateX( - Math.PI / 2 );
		const material = new THREE.MeshBasicMaterial( {color: 0x555555, side: THREE.DoubleSide} );

		plane = new THREE.Mesh(planeGeometry, material);
		plane.position.y = 0;
		plane.position.x = 0;
		plane.position.z = 0;
		plane.receiveShadow = true;
		plane.scale.x = controller.planeWidth;
		plane.scale.z = controller.planeHeight;
		var planeAxis = new THREE.AxesHelper(200);
  		plane.add(planeAxis);
		scene.add(plane);

		renderer = new THREE.WebGLRenderer( { antialias: true } );
		renderer.setPixelRatio( window.devicePixelRatio );
		renderer.setSize( window.innerWidth, window.innerHeight );
		document.body.appendChild( renderer.domElement );

		window.addEventListener( 'resize', onWindowResize, false );
		document.addEventListener( 'pointerdown', onPointerDown );
		document.addEventListener('keyup', (event) => {
			var name = event.key;
			if (transformControl.object && (name === "Backspace" || name === "Delete")) {
				const target = transformControl.object;
				if(target.name === "camera") {
					const index = camerasArray.findIndex(c => c.cameraPlane === target);
					if (index > -1) {
						transformControl.detach(target);
						scene.remove(target);
						camerasArray.splice(index, 1);
					}
				}
				if(target.name === "master_path_node") {
					const index = masterPathsArray.findIndex(mp => 
						mp.basePointsMeshes.some(bp => {
							return bp.uuid === target.uuid;
						})
					);
					if (index > -1) {
						transformControl.detach(target);
						masterPathsArray[index].hide();
						masterPathsArray.splice(index, 1);
					}
				}
			}
		}, false);

		const controls = new OrbitControls( camera, renderer.domElement );
		scene.add(controls);

		// Create Transform controls
		transformControl = new TransformControls(camera, renderer.domElement);
		transformControl.showY = false;
		transformControl.addEventListener( 'dragging-changed', function (event) {
			controls.enabled = !event.value;
		});
		transformControl.addEventListener('objectChange', function () {
			[...masterPathsArray, ...camerasArray].forEach(mpa => {
				mpa.updateSpline();
			});
		});
		scene.add(transformControl);

		// Helper Grid
		var grid = new THREE.GridHelper(3000, 30);
		scene.add(grid);

		// GUI
		gui = new GUI()

		var f1 = gui.addFolder('Master Paths');
		f1.add(controller, 'pathPoints', 2, 20).step(1).name('Path Points');
		f1.add(controller, 'showMasterPaths').onChange( function() {	
			 masterPathsArray.forEach(mp => (controller.showMasterPaths) ? mp.show() : mp.hide());
	    }).name('Show Master Paths');
	    f1.add({addNewMasterPath:function(){ 
			const mp = new MasterPath();
			console.log("Added new line with length: ", mp.path.getLength());
			mp.show();
			masterPathsArray.push(mp);
		}}, 'addNewMasterPath').name('Add Master Path');
		f1.open();

		var f2 = gui.addFolder('Planimetry');
		f2.add(controller, 'planeWidth', 500, 3000).step(20).onChange(function() {
			plane.scale.x = controller.planeWidth;
		}).name('Plane Width [cm]');
		f2.add(controller, 'planeHeight', 500, 3000).step(20).onChange(function() {
			plane.scale.z = controller.planeHeight;
		}).name('Plane Height [cm]');
		f2.open();

		var f3 = gui.addFolder('Cameras');
		f3.add(controller, 'cameraWidth', 100, 1000).step(10).name('Camera Width [cm]');
		f3.add(controller, 'cameraHeight', 100, 1000).step(10).name('Camera Height [cm]');
		f3.add({addNewCamera:function(){ 
			const c = new Camera();
			camerasArray.push(c);
		}}, 'addNewCamera').name('Add New Camera');
		f3.open();

		var f4 = gui.addFolder('Agents');
		f4.add(controller, 'pathNoise', 0, 100).name('Path\'s Deviation Delta');
      	f4.add(controller, 'numAgents', 1, 2000).step(1).name('Number of Agents');
      	f4.add(controller, 'showPaths').onChange( function() {	
			if (controller.showPaths) {
				agentsArray.forEach(a => scene.add(a.line));
			} else {
				agentsArray.forEach(a => scene.remove(a.line));
			}
	    }).name('Show Agents\' Paths');
      	f4.add(controller, 'biDirectional').name('Agents\' Move Both Dir');

      	f4.add(controller, 'agentsSpeed', 50, 300).step(1).name('Agents\' Speed [cm/s]').onFinishChange(function () {
      		// To prevent negative speed values we bound the deviation
			speed_dev.__max = (controller.agentsSpeed/2) - 20;
			controller.agentsSpeedDeviation = (controller.agentsSpeedDeviation > speed_dev.__max) ? speed_dev.__max : controller.agentsSpeedDeviation;
			speed_dev.updateDisplay();
	 	});

      	const speed_dev = f4.add(controller, 'agentsSpeedDeviation', 0, ((controller.agentsSpeed/2) - 20)).step(1).name('Agents\' Speed Delta [cm/s]');
      	f4.add(controller, 'agentsSpeedIsLinear').name('Agents\' Speed Linear');
		f4.open();

		var f5 = gui.addFolder('Simulation');
		f5.add(controller, 'FPS', 1, 60).onChange( function() {
	       interval = 1 / controller.FPS;
	    }).name('Limit FPS To');
	    f5.add(controller, 'spawnDuration', 0, 300).step(1).name('Spawn\' duration [s]');
		f5.add({startSimulation:function(){
			transformControl.detach();
			if (masterPathsArray.length < 1) {
				alert("Generate at least one master path");
				return;
			}
			generateAgents();
			state = "run";
		}}, 'startSimulation').name('Start Simulation');
		f5.add({generateJSONData:function(){
			if (state === "run") {
				alert("simulation is still running");
				return;
			}
			transformControl.detach();
			if (masterPathsArray.length < 1) {
				alert("Generate at least one master path");
				return;
			}
			if (camerasArray.length < 1) {
				alert("Add at least one camera");
				return;
			}
			generateAgents();
			generateJSON();
		}}, 'generateJSONData').name('Generate JSON Data');
		f5.open();

		animate();
	}

}

function generateJSON() {
	let jsonOutput = [];
	let currentTime = 0;
	let timestamp = Date.now();
	let activeAgents = [];

	while (currentTime <= controller.spawnDuration || activeAgents.length > 0) {
		timestamp += (interval * 1000);
		for(let i=0; i<controller.numAgents; i++) {
			const a = agentsArray[i];
			if(currentTime > a.startTime) {
				if (a.direction && a.currentPosition === 0) {
					activeAgents.push(a.mesh.uuid);
				} else if (a.direction && a.currentPosition >= a.path.getLength()) {
					const index = activeAgents.indexOf(a.mesh.uuid);
					if (index > -1) {
					  activeAgents.splice(index, 1);
					}
				} else if (!a.direction && a.currentPosition === a.path.getLength()) {
					activeAgents.push(a.mesh.uuid);
				} else if (!a.direction && a.currentPosition < 0.01) {
					const index = activeAgents.indexOf(a.mesh.uuid);
					if (index > -1) {
					  activeAgents.splice(index, 1);
					}
				}
				// the tick depends on the FPS
				a.tick(interval);
				// pathLength : 1 = currentPosition : x
				const pathLength = a.path.getLength();
				const pointOnPath = a.currentPosition / pathLength;
				const pointOnLine = a.path.getPointAt(pointOnPath);
				console.log(pointOnLine);
				camerasArray.forEach((camera, idx) => {
					if (camera.isOnPlane(pointOnLine)) {
						jsonOutput.push({"camera": idx, "timestamp": timestamp, "position": camera.getRelativePosition(pointOnLine)});
					}
				})
			}
		}
		currentTime += interval;
	}

	saveJson(jsonOutput);
}

function generateAgents() {
	agentsArray.forEach(a => {
		scene.remove(a.mesh);
		scene.remove(a.line);
	});
	agentsArray = [];
	deltaResidual = 0;
	elapsedTime = 0;
	clock = new THREE.Clock();
	if (masterPathsArray.length < 1) return;
	for(let i=0; i<controller.numAgents; i++) {
		const chosenPath = Math.floor(Math.random()*masterPathsArray.length)
		const a = new Agent(masterPathsArray[chosenPath]);
		agentsArray.push(a);
	}
}

function generatePath(base) {
	const pointsVectors = base.map(p => {
		const x = p.x + (Math.ceil(Math.random() * controller.pathNoise) * (Math.round(Math.random()) ? 1 : -1));
		const z = p.z + (Math.ceil(Math.random() * controller.pathNoise) * (Math.round(Math.random()) ? 1 : -1));
		return new THREE.Vector3(x, p.y, z);
	});
	return generatePathObjects(pointsVectors)
}

function generatePathObjects(pointsVectors, main=false) {
	const path = new THREE.CatmullRomCurve3(pointsVectors);
	const points = path.getPoints(150);
	const geometry = new THREE.BufferGeometry().setFromPoints( points );
	const color = new THREE.Color(0xffffff);
    color.setHex((main) ? 0xffff00 : Math.random() * 0xffffff );
	const material = new THREE.LineBasicMaterial({ color: color });
	const curveObject = new THREE.Line(geometry, material);
	return [path, curveObject];
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateAgentsPosition(elapsedTime, delta, move) {
	for(let i=0; i<controller.numAgents; i++) {
		const a = agentsArray[i];
		if(elapsedTime > a.startTime) {
			if (a.direction && a.currentPosition === 0) {
				scene.add(a.mesh);
			} else if (a.direction && a.currentPosition >= a.path.getLength()) {
				scene.remove(a.mesh);
			} else if (!a.direction && a.currentPosition === a.path.getLength()) {
				scene.add(a.mesh);
			} else if (!a.direction && a.currentPosition < 0.01) {
				scene.remove(a.mesh);
			}

			a.tick(delta);

			if(move) {
				// pathLength : 1 = currentPosition : x
				const pathLength = a.path.getLength();
				const pointOnPath = a.currentPosition / pathLength;
				const pointOnLine = a.path.getPointAt(pointOnPath);

				a.mesh.position.set(pointOnLine.x, 80, pointOnLine.z);
			}
		}
	}
}

function animate() {
	requestAnimationFrame(animate);
	if(state == "run") {
		delta = clock.getDelta();
		deltaResidual += delta;
		elapsedTime += delta;
	    if (deltaResidual  > interval) {
			updateAgentsPosition(elapsedTime, delta, true);
			deltaResidual = deltaResidual % interval;
	    } else {
	    	updateAgentsPosition(elapsedTime, delta, false);
	    }

	    if(elapsedTime > controller.spawnDuration && !scene.getObjectByName('agent')) {
			state = "idle";
			alert("simulation completed");
		}
	}
	renderer.render(scene, camera);
}

function onPointerDown( event ) {
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
	raycaster.setFromCamera(mouse, camera);
	let intersects = []

	masterPathsArray.forEach(mpa => {
		const aaa = raycaster.intersectObjects(mpa.basePointsMeshes);
		intersects.push(...aaa);
	});

	camerasArray.forEach(c => {
		const aaa = raycaster.intersectObject(c.cameraPlane);
		intersects.push(...aaa);
	});

	if(intersects.length > 0) {
		const object = intersects[0].object;
		if ( object !== transformControl.object ) {
			transformControl.attach( object );
		}
	}
}

class Agent {
	constructor(mp) {
		// Generate agent's path
		const [path, line] = generatePath(mp.basePointsVectors);
		this.path = path;
		this.line = line;

	    this.startTime = Math.random() * controller.spawnDuration;
	    const calculatedSpeed = controller.agentsSpeed + ((Math.random() * controller.agentsSpeedDeviation) * (Math.round(Math.random()) ? 1 : -1));
	    this.baseSpeed = Math.max(0.2, calculatedSpeed);
	    this.direction = (Math.random() > 0.5 && controller.biDirectional) ? false : true;
	    this.currentPosition = (this.direction) ? 0 : this.path.getLength();

	    const geometry = new THREE.ConeGeometry( 25, 160, 10 );
		const material = new THREE.MeshBasicMaterial( { color: (this.direction) ? 0xffff00 : 0x00ffff  } );
		this.mesh = new THREE.Mesh( geometry, material );
		this.mesh.name = "agent";
		this.mesh.position.set(-5000, -500, -5000);
	 }

	 tick(delta) {
	 	// base speed is meters/s, delta is seconds so the result is meters
	 	const ammountMoved = this.baseSpeed * delta;
	 	this.currentPosition -= (this.direction) ? (-1 * ammountMoved) : ammountMoved;
	 	if (this.direction && this.currentPosition > this.path.getLength()) this.currentPosition = this.path.getLength();
	 	if (!this.direction && this.currentPosition < 0) this.currentPosition = 0;
	 }
}

class MasterPath {
	constructor() {
		this.basePointsVectors = [];
		for(let i=0; i<controller.pathPoints; i++) {
			const xShift = -850 + (1800/controller.pathPoints) * i;
			const zShift = ((i % 2) == 0) ? -200 : 200;
			this.basePointsVectors.push(new THREE.Vector3(xShift, 11, zShift));
		}
		const [path, line] = generatePathObjects(this.basePointsVectors, true);
		this.path = path;
		this.line = line;

		this.basePointsMeshes = [];
		this.basePointsVectors.forEach(p => {
			const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
			cube.name = "master_path_node";
			cube.position.copy(p);
			this.basePointsMeshes.push(cube);
		});
	}

	show() {
		scene.add(this.line);
		this.basePointsMeshes.forEach(c => {
			scene.add(c);
		});
	}

	hide() {
		scene.remove(this.line);
		this.basePointsMeshes.forEach(c => {
			scene.remove(c);
		});
	}

	updateSpline() {
		scene.remove(this.line);
		this.basePointsVectors = this.basePointsMeshes.map(pm => pm.position);
		const [path, line] = generatePathObjects(this.basePointsVectors, true);
		this.path = path;
		this.line = line;
		scene.add(this.line);
	}
}

class Camera {
	constructor() {
		this.geometry = new THREE.PlaneGeometry(1, 1);
		this.geometry.rotateX(- Math.PI / 2);
		let material = new THREE.MeshBasicMaterial( {color: 0x222222, side: THREE.DoubleSide} );
		this.cameraPlane = new THREE.Mesh(this.geometry, material);
		this.cameraPlane.position.y = 10.5;
		this.cameraPlane.position.x = 0;
		this.cameraPlane.position.z = 0;
		this.cameraPlane.scale.x = controller.cameraWidth;
		this.cameraPlane.scale.z = controller.cameraHeight;
		this.cameraPlane.name = "camera";
		scene.add(this.cameraPlane);
		this.updateSpline();
	}

	updateSpline() {
		this.min_x = this.cameraPlane.position.x - (this.cameraPlane.scale.x / 2);
		this.max_x = this.cameraPlane.position.x + (this.cameraPlane.scale.x / 2);
		this.min_z = this.cameraPlane.position.z - (this.cameraPlane.scale.z / 2);
		this.max_z = this.cameraPlane.position.z + (this.cameraPlane.scale.z / 2);
	}

	isOnPlane(point) {
		if (
			point.x > this.min_x && 
			point.x < this.max_x &&
			point.z > this.min_z && 
			point.z < this.max_z
		) return true;
		else return false;
	}

	getRelativePosition(point) {
		return [point.x - this.min_x, point.z - this.min_z];
	}
}

// TO GENERATE AND DOWNLOAD JSON
var saveJson = function(obj) {
	var str = JSON.stringify(obj);
	var data = encode( str );

	var blob = new Blob( [ data ], {
		type: 'application/octet-stream'
	});
	
	var url = URL.createObjectURL( blob );
	var link = document.createElement( 'a' );
	link.setAttribute( 'href', url );
	link.setAttribute( 'download', 'data.json' );
	var event = document.createEvent( 'MouseEvents' );
	event.initMouseEvent( 'click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
	link.dispatchEvent(event);
}


var encode = function(s) {
	var out = [];
	for ( var i = 0; i < s.length; i++ ) {
		out[i] = s.charCodeAt(i);
	}
	return new Uint8Array( out );
}

export default App;
