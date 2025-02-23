<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { messages, pythonCode, stepFileUrl, sendMessageToAI, runPythonCode, errorLog, socket } from "$lib/socket";
    import StepViewer from "$lib/StepViewer.svelte";
    import { get } from "svelte/store";
    import type * as monaco from 'monaco-editor';
    import { marked } from 'marked';

    let userInput = "";

    let editorContainer: HTMLDivElement;
    let editor: monaco.editor.IStandaloneCodeEditor; 

    let currentContent = ""; 

    onMount(async () => {
        if (typeof window !== 'undefined') {
            const monaco = await import('monaco-editor');

            monaco.editor.defineTheme('custom-dark', {
                base: 'vs-dark', // Base on the dark theme
                inherit: true,
                rules: [],
                colors: {
                'editor.background': '#111827', // Custom background color (dark blueish-gray)
                'editor.foreground': '#ffffff', // Text color
                'editor.lineHighlightBackground': '#2c2c3b', // Highlight current line
                'editorCursor.foreground': '#ffcc00', // Cursor color
                'editorIndentGuide.background': '#404040', // Indentation guides
                'editorIndentGuide.activeBackground': '#707070' // Active indentation guide
                }
            });

            editor = monaco.editor.create(editorContainer, {
                value: get(pythonCode), // Initial code from the store
                language: 'python',
                theme: 'custom-dark',
                automaticLayout: true,
                fontSize: 14,
                minimap: { enabled: false }
            });

            // Update store when user edits the code
            editor.onDidChangeModelContent(() => {
                const newValue = editor.getValue();
                if (newValue !== get(pythonCode)) {
                pythonCode.set(newValue);
                }
            });
        }
    });

    $: if (editor && $pythonCode !== currentContent) {
        currentContent = $pythonCode;

        // Avoid unnecessary updates while typing
        const selection = editor.getSelection(); // Preserve cursor position
        editor.setValue($pythonCode);
        if (selection) {
            editor.setSelection(selection); // Only set if selection is not null
        }
    }

    function handleRun() {
        console.log("Running python code...", $pythonCode);
        runPythonCode($pythonCode);

        const clearEvent = new Event("clear-viewer");
        window.dispatchEvent(clearEvent);

        // Force reload STL after clearing
        setTimeout(() => {
            const baseUrl = get(stepFileUrl);
            const newUrl = `${baseUrl}?cache_buster=${Date.now()}`;

            // Reset the store to trigger reactivity
            stepFileUrl.set("");
            setTimeout(() => {
            console.log("🎯 Updating stepFileUrl with new cache-busted URL:", newUrl);
            stepFileUrl.set(newUrl);
            }, 50);
        }, 300);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
        handleSend();
        }
    };

    function handleSend() {
        if (userInput.trim()) {
            sendMessageToAI(userInput);
            userInput = "";

            // Manually dispatch clear event
            const clearEvent = new Event("clear-viewer");
            window.dispatchEvent(clearEvent);

            // Force reload STL after clearing
            setTimeout(() => {
                const baseUrl = get(stepFileUrl);
                const newUrl = `${baseUrl}?cache_buster=${Date.now()}`;

                // Reset the store to trigger reactivity
                stepFileUrl.set("");
                setTimeout(() => {
                console.log("🎯 Updating stepFileUrl with new cache-busted URL:", newUrl);
                stepFileUrl.set(newUrl);
                }, 50);
            }, 300);
        }
    }
    
</script>

<h1 class="text-2xl font-bold text-center mt-6">upscaled</h1>

<div class="flex md:flex-row flex-col flex-wrap gap-4 mt-6 items-start">
    <!-- Left Column -->
    <div class="flex flex-col space-y-4" style="flex: 1; max-width: 50%;">
        <div class="chat p-4 bg-gray-100 rounded-lg shadow-lg h-116 overflow-y-auto" style="margin-left:10px">
            <h2 class="text-l font-semibold">you &lt;&gt; gpt</h2>
            {#each $messages as msg}
              <div
                class="{msg.sender === 'user' ? 'text-right text-blue-600' : 'text-left text-green-600'} my-2"
              >
                <strong>{msg.sender === "user" ? "you" : "gpt"}:</strong>
                <div class="markdown-content">
                  {@html marked(msg.text.replace("```", ""))}
                </div>
              </div>
            {/each}
        </div>
        <div class="flex items-center space-x-2">
            <input
                bind:value={userInput}
                placeholder="type a message..."
                on:keydown={handleKeyDown}
                class="w-full p-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400" style="margin-left:10px"
            />
            <button
                on:click={handleSend}
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer"
            >
                send
            </button>
        </div>
    </div>

    <!-- Right Column -->
    <div class="flex flex-col space-y-4" style="flex: 1; max-width: 50%;">
        <!-- <div class="bg-gray-900 text-white p-4 rounded-lg shadow-md overflow-y-auto whitespace-pre-wrap font-mono" style="height: 20rem;">
            <h2 class="text-l font-semibold">Generated Python Code</h2>
            <pre>{$pythonCode}</pre>
        </div> -->
        <div class="bg-gray-900 text-white p-1 rounded-lg shadow-md h-32 overflow-hidden" style="height: 20rem; margin-right:10px">
            <h2 class="text-l font-semibold p-2">generated python code</h2>
            <div bind:this={editorContainer} class="w-full h-full"></div>
        </div>
        <div class="bg-gray-900 text-white p-2 rounded-lg shadow-md h-32 overflow-y-auto" style="margin-right:10px">
            <h3 class="text-l font-semibold p-1">output terminal</h3>
            <pre>{$errorLog}</pre>
        </div>
        <div class="flex flex-row space-x-5">
            <div class="relative group">
                {#if $stepFileUrl}
                    <a
                        href={$stepFileUrl}
                        download={$stepFileUrl.split('/').pop() || 'download.step'}
                        class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center"
                    >
                        3mf
                    </a>
                {:else}
                    <button
                        disabled
                        class="px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
                    >
                        3mf
                    </button>
                {/if}
                <span class="absolute top-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 text-sm text-white bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    download
                </span>
            </div>
            <div class="relative group">
                {#if $stepFileUrl}
                    <a
                        href={$stepFileUrl.replace("3mf", "stl")}
                        download={$stepFileUrl.replace("3mf", "stl").split('/').pop() || 'download.step'}
                        class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center"
                    >
                        stl
                    </a>
                {:else}
                    <button
                        disabled
                        class="px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
                    >
                        stl
                    </button>
                {/if}
                <span class="absolute top-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 text-sm text-white bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    download
                </span>
            </div>
            <div class="relative group">
                {#if $stepFileUrl}
                    <a
                        href={$stepFileUrl.replace("3mf", "step")}
                        download={$stepFileUrl.replace("3mf", "step").split('/').pop() || 'download.step'}
                        class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center"
                    >
                        step
                    </a>
                {:else}
                    <button
                        disabled
                        class="px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed"
                    >
                        step
                    </button>
                {/if}
                <span class="absolute top-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 text-sm text-white bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    download
                </span>
            </div>
            <button
                on:click={handleRun}
                class="flex-grow px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center cursor-pointer" style="margin-right:10px"

            >
                run
            </button>

        </div>
        
    </div>
</div>

<!-- 🏗️ 3D Model Viewer Section -->
<h2 class="text-2xl font-semibold text-center mt-10 text-gray-700">Geneerated 3D Model</h2>
{#if $stepFileUrl}
  <StepViewer stlFileUrl={`${$stepFileUrl}?cache_buster=${Date.now()}`} />
{:else}
  <p class="text-center text-gray-500 mt-4">You haven't rendered a file yet.</p>
{/if}


<footer class="w-screen bg-gray-800 text-white py-6 mt-10">
    <div class="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-center items-center space-y-4 md:space-y-0">
      
      <!-- Left Section: Copyright -->
      <div class="text-sm">
        made by spencer boebel & nicholas stone @ georgia tech
      </div>
      
</footer>