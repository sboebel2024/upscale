<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import * as THREE from "three";
  import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { viewerBuffer } from "$lib/socket";

  export let stlFileUrl: string; // STL file URL
  let container: HTMLDivElement | null = null;
  let mesh: THREE.Mesh | null = null;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;

  function handleResize() {
    if (!container || !camera || !renderer) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Update camera aspect ratio and projection matrix
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Update renderer size
    renderer.setSize(width, height);

    console.log("📐 Resized viewer to:", width, "x", height);
  }

  onMount(() => {
    if (!container) {
      console.error("❌ Container not initialized.");
      return;
    }

    initScene();
    loadSTL(stlFileUrl); // Manual fetch STL when mounted

    window.addEventListener("clear-viewer", handleClearViewer);
    window.addEventListener("resize", handleResize);


    return () => {
      window.removeEventListener("clear-viewer", handleClearViewer);
      window.removeEventListener("resize", handleResize);
      disposeRenderer();
    };
  });

  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    if (!container) {
      console.error("❌ Cannot initialize scene: container is null");
      return;
    }

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); // ✅ No transparency
    renderer.setClearColor(0xffffff, 1); // ✅ Force canvas background to white
    renderer.setSize(container.clientWidth, container.clientHeight);

    // ✅ Apply styling directly to renderer DOM element
   

    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 0, 1).normalize();
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(50, 50, 50);
    scene.add(pointLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  }

  async function loadSTL(url: string) {
    try {
      console.log(`🔄 Fetching 3MF from: ${url}`);

      // Fetch with cache-busting
      const response = await fetch(`${url}?cache_buster=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch 3MF file: ${response.statusText}`);
      }

      // Remove the old mesh from the scene
      if (mesh) {
        console.log("🗑️ Removing old mesh from scene");
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
        mesh = null;
      }

      // Load geometry from fetched 3MF data
      const arrayBuffer = await response.arrayBuffer();
      const loader = new ThreeMFLoader();
      const loadedObject = loader.parse(arrayBuffer); // This returns an Object3D

      // ✅ Traverse the object and find meshes with type safety
      loadedObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          mesh = child;

          // ✅ Compute and apply scaling & centering
          mesh.geometry.computeBoundingBox();
          const boundingBox = mesh.geometry.boundingBox;
          if (boundingBox) {
            const size = new THREE.Vector3();
            boundingBox.getSize(size);
            const maxDimension = Math.max(size.x, size.y, size.z);
            const targetSize = 100;
            const scale = targetSize / maxDimension;
            mesh.scale.set(scale, scale, scale);

            const center = new THREE.Vector3();
            boundingBox.getCenter(center);
            mesh.position.sub(center);
          }

          // ✅ Add mesh with color and material info
          scene.add(mesh);
          console.log("✅ Successfully added 3MF mesh to the scene");
        }
      });

      if (!mesh) {
        throw new Error("No mesh found in the loaded 3MF file");
      }
    } catch (error) {
      console.error("❌ Error loading 3MF:", error);
    }
  }


  function handleClearViewer() {
    console.log("🔥 Manual clear triggered");
    clearViewer();
  }

  function clearViewer() {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material.dispose();
      }
      mesh = null;
    }
    renderer.clear();
  }

  function disposeRenderer() {
    if (renderer) {
      renderer.dispose();
    }
  }

  $: if (stlFileUrl) {
    console.log("🔄 Detected new STL URL:", stlFileUrl);
    loadSTL(stlFileUrl);
  }
</script>

<!-- Viewer Container -->
<div 
  bind:this={container}
  class="relative flex items-center justify-center w-[90vw] max-w-[90vw] h-[500px] rounded-lg shadow-lg bg-white border border-gray-300 mx-auto my-6 p-4 overflow-hidden"
>
  <!-- 🌀 Loading Spinner -->
  {#if $viewerBuffer}
    <div class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 z-10">
      <svg class="animate-spin h-16 w-16 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
    </div>
  {/if}
</div>
