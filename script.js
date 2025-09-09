// ----------------------
// Global state
// ----------------------
let codeMirrorEditor = null;
let pyodide = null;

let currentModuleData = null;
let currentTopicIndex = 0;
let currentQuestionIndex = 0;
let linearItems = [];
const answeredMap = new Map(); // index -> {status, topic, answer, correctAnswer}
const codeMap = new Map();     // index -> user code
const topicProgress = new Map(); // topic -> {completed, total, correct}
const userAnswers = {};
var totalQuestions = 0;
var totalCorrect = 0;

const moduleInfo = document.getElementById('moduleInfo');
const letsBeginBtn = document.getElementById('letsBeginBtn');

const assessmentArea = document.getElementById('assessmentArea');
const welcomeView = document.getElementById('welcomeView');
const topicSelectionView = document.getElementById('topicSelectionView');
const topicSelectionGrid = document.getElementById('topicSelectionGrid');

const mcqView = document.getElementById('mcqView');
const mcqQuestionEl = document.getElementById('mcqQuestion');
const mcqOptionsEl = document.getElementById('mcqOptions');
const mcqExplanationEl = document.getElementById('mcqExplanation');
const questionNav = document.getElementById('questionNav');
const mcqSubmitBtn = document.getElementById("mcqSubmitBtn");
const runBtn = document.getElementById("runBtn");
const submitBtn = document.getElementById("submitBtn");

const finishBtn = document.getElementById('finishBtn');
const finishReportView = document.getElementById('finishReportView');

const codeView = document.getElementById('codeView');
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');

const downloadBtn = document.getElementById('downloadPdfBtn');
const mainContainer = document.querySelector('.main-container');
   
// ----------------------
// Module loading & UI
// ----------------------
async function loadModuleIntoUI() {
    try {
        const resp = await fetch('modules/assessment-topics.json', { cache: 'no-store' });
        currentModuleData = resp.ok ? await resp.json() : EMBEDDED_DEMO_MODULE;
        moduleInfo.textContent = currentModuleData.moduleName || 'Demo Module';
        buildTopicSelectionGrid();
        currentTopicIndex = 0;
    } catch (err) {
        console.error(err);
        moduleInfo.textContent = 'Error loading module';
    }
}

function buildTopicSelectionGrid() {
    if (!currentModuleData || !currentModuleData.topics) return;

    topicSelectionGrid.innerHTML = '';
    const completedTopics = JSON.parse(localStorage.getItem('completedTopics') || '[]');

    currentModuleData.topics.forEach((topic, index) => {
        const totalQuestions = (topic.mcqs?.length || 0) + (topic.codeTasks?.length || 0);
        topicProgress.set(topic.name, { completed: 0, total: totalQuestions, correct: 0 });

        const topicButton = document.createElement('button');
        topicButton.className = 'topic-button';
        topicButton.textContent = topic.name;

        if (completedTopics.includes(topic.name)) {
            topicButton.disabled = true;
            topicButton.classList.add('completed'); // optional CSS styling
        } else {
            topicButton.onclick = () => switchToTopic(index);
        }

        topicSelectionGrid.appendChild(topicButton);
    });

    // Toggle top-level overall results button if all topics completed
    const showOverallTop = document.getElementById('showOverallResultsBtnTop');
    if (showOverallTop) {
        if (completedTopics.length && currentModuleData.topics && completedTopics.length === currentModuleData.topics.length) {
            showOverallTop.style.display = '';
            showOverallTop.onclick = () => {
                document.getElementById('topicSelectionPane').style.display = 'none';
                showOverallResults();
            };
        } else {
            showOverallTop.style.display = 'none';
            showOverallTop.onclick = null;
        }
    }
}
document.getElementById('backBtn').onclick = () => {
    window.scrollTo(0, 0);
    assessmentArea.style.display = 'none';
    topicReportView.style.display = 'none';
    document.getElementById('topicSelectionPane').style.display = 'block';
    disableCompletedTopics();
    // Toggle top-level overall results button if all topics completed
    const showOverallTop = document.getElementById('showOverallResultsBtnTop');
    if (showOverallTop) {
        if (completedTopics.length && currentModuleData.topics && completedTopics.length === currentModuleData.topics.length) {
            showOverallTop.style.display = '';
            showOverallTop.onclick = () => {
                document.getElementById('topicSelectionPane').style.display = 'none';
                showOverallResults();
            };
        } else {
            showOverallTop.style.display = 'none';
            showOverallTop.onclick = null;
        }
    }
};

function switchToTopic(topicIndex) {
    currentTopicIndex = topicIndex;
    currentQuestionIndex = 0;
    loadTopicQuestions();

    window.scrollTo(0, 0);

    // Hide topic selection pane and show assessment pane
    document.getElementById('topicSelectionPane').style.display = 'none';
    document.getElementById('assessmentArea').style.display = 'grid';

    // Add assessment mode for two-column layout
    document.querySelector('.main-container').classList.add('assessment-mode');

    // Update the topic title
    const topic = currentModuleData.topics[currentTopicIndex];
    document.getElementById('currentTopicTitle').textContent = topic.name;

    // Show question container
    questionContainer.style.display = 'block';
}

function loadTopicQuestions() {
    if (!currentModuleData || !currentModuleData.topics[currentTopicIndex]) return;

    const topic = currentModuleData.topics[currentTopicIndex];
    linearItems = [];

    // Add MCQs for this topic
    (topic.mcqs || []).forEach(q => {
        linearItems.push({
            type: 'mcq',
            data: q,
            topic: topic.name
        });
    });

    // Add code tasks for this topic
    (topic.codeTasks || []).forEach(t => {
        linearItems.push({
            type: 'code',
            data: t,
            topic: topic.name
        });
    });


    renderCurrentItem();
    renderQuestionNav();
}

function renderCurrentItem() {
    setOutputs();
    if (!linearItems.length || currentQuestionIndex < 0 || currentQuestionIndex >= linearItems.length) return;

    const item = linearItems[currentQuestionIndex];

    // Update question header with number
    const questionNumberEl = document.getElementById('questionNumber');
    if (questionNumberEl) {
        questionNumberEl.textContent = `${currentQuestionIndex + 1} of ${linearItems.length}`;
    }

    if (item.type === 'mcq') renderMcqItem(item.data);
    else renderCodeItem(item.data);

    highlightQuestionNav();
}

function renderQuestionNav() {
    if (!questionNav) return;
    questionNav.innerHTML = '';
    linearItems.forEach((it, idx) => {
        const btn = document.createElement('button');
        btn.className = 'qbtn' + (it.type === 'code' ? ' code' : '');
        btn.textContent = (idx + 1).toString();
        const status = answeredMap.get(`${currentTopicIndex}-${idx}`)?.status;
        if (status) btn.classList.add('done');
        if (idx === currentQuestionIndex) btn.classList.add('active');
        btn.onclick = () => { currentQuestionIndex = idx; renderCurrentItem(); };
        questionNav.appendChild(btn);
    });

    // Ensure the navigation is displayed as a row
    questionNav.style.display = 'flex';
    questionNav.style.flexDirection = 'row';
    questionNav.style.flexWrap = 'wrap';
}

function highlightQuestionNav() {
    if (!questionNav) return;
    Array.from(questionNav.children).forEach((c, i) => {
        c.classList.toggle('active', i === currentQuestionIndex);
        const status = answeredMap.get(`${currentTopicIndex}-${i}`)?.status;
        c.classList.toggle('done', Boolean(status));
    });
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderQuestionText(question) {
    const containerFont = 'Arial, sans-serif'; // main font
    const lines = question.split('\n');

    return `<div style="font-family:${containerFont}; font-size:16px;">` +
        lines.map(line => {
            if (line.startsWith('    ') || line.startsWith('\t')) {
                // code line: preserve indentation, no <pre>
                return `<code style="white-space: pre;">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</code><br>`;
            } else {
                return `<span>${line}</span><br>`;
            }
        }).join('') +
        `</div>`;
}


// ----------------------
// MCQ Rendering
// ----------------------
function renderMcqItem(mcq) {
    mcqView.style.display = '';
    codeView.style.display = 'none';
    mcqQuestionEl.innerHTML = renderQuestionText(mcq.question);
    mcqExplanationEl.textContent = '';
    mcqExplanationEl.className = 'explanation muted';
    mcqOptionsEl.innerHTML = '';

    (mcq.options || []).forEach((opt, i) => {
        const id = `opt_${currentTopicIndex}_${currentQuestionIndex}_${i}`;
        const wrapper = htmlToElement(`
        <label style="display:flex;gap:6px;align-items:flex-start;">
            <input type="radio" name="mcq_${currentTopicIndex}_${currentQuestionIndex}" value="${i}" id="${id}" />
            <span>${escapeHtml(opt)}</span>
        </label>
    `);
        mcqOptionsEl.appendChild(wrapper);
    });
}


// ----------------------
// Code Rendering
// ----------------------
function renderCodeItem(task) {


    mcqView.style.display = 'none';
    codeView.style.display = 'block';
    taskTitle.style.whiteSpace = 'pre-wrap';
    taskTitle.textContent = task.question || '';
    taskDescription.textContent = task.description || '';


    const savedCode = codeMap.get(`${currentTopicIndex}-${currentQuestionIndex}`);
    const starter = savedCode || task.starterCode || '# Write your solution here\n';
    if (codeMirrorEditor) {
        codeMirrorEditor.setValue(starter);

        codeMirrorEditor.setOption('readOnly', false);
        codeMirrorEditor.on('change', () => {
            codeMap.set(`${currentTopicIndex}-${currentQuestionIndex}`, codeMirrorEditor.getValue());
        });

        // Refresh the editor to ensure proper rendering
        setTimeout(() => {
            codeMirrorEditor.refresh();
        }, 50);
    }


    runBtn.disabled = false;
    submitBtn.disabled = false;

    // Clear previous output
    // setOutputs();
}

// ----------------------
// Editor setup
// ----------------------
function setupEditor() {
    if (codeMirrorEditor) return codeMirrorEditor;

    const textarea = document.getElementById("editor");
    codeMirrorEditor = CodeMirror.fromTextArea(textarea, {
        mode: "python",
        lineNumbers: true,
        indentUnit: 4,
        theme: "dracula",
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        autoCloseQuotes: true,
        foldGutter: false,
        gutters: ["CodeMirror-linenumbers"],
        extraKeys: {
            "Tab": function (cm) {
                if (cm.somethingSelected()) cm.indentSelection("add");
                else cm.replaceSelection("    ", "end");
            },
            "Shift-Tab": "indentLess",
            "Backspace": function (cm) {
                const cursor = cm.getCursor();
                const line = cm.getLine(cursor.line);
                const beforeCursor = line.slice(0, cursor.ch);

                // If cursor is only in leading whitespace
                if (/^\s+$/.test(beforeCursor)) {
                    const indentSize = cm.getOption("indentUnit") || 4;
                    const toRemove = beforeCursor.length % indentSize || indentSize;
                    cm.replaceRange("", { line: cursor.line, ch: cursor.ch - toRemove }, { line: cursor.line, ch: cursor.ch });
                } else {
                    cm.deleteH(-1, "char"); // normal backspace
                }
            }
        }, indentWithTabs: false,
        smartIndent: true,
        electricChars: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        autoCloseQuotes: true,
        styleActiveLine: false,
        lineWiseCopyCut: true,
        pasteLinesPerSelection: true
    });

    // Set the size after initialization
    setTimeout(() => {
        codeMirrorEditor.setSize("100%", "100%");
        codeMirrorEditor.refresh();

        // Force refresh the gutter positioning
        setTimeout(() => {
            codeMirrorEditor.refresh();
            // Ensure proper positioning
            const editorElement = codeMirrorEditor.getWrapperElement();
            if (editorElement) {
                editorElement.style.width = '100%';
                editorElement.style.height = '100%';
                editorElement.style.margin = '0';
                editorElement.style.padding = '0';
                editorElement.style.borderRadius = '0';
            }
        }, 50);
    }, 100);

    return codeMirrorEditor;
}


// ----------------------
// Pyodide Execution
// ----------------------
async function ensurePyodide() {
    if (pyodide) return pyodide;
    pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' });
    return pyodide;
}

// ----------------------
// Run Code (student wants to test their code)
// ----------------------
async function runCurrentCode() {
    const item = linearItems[currentQuestionIndex];
    if (!item || item.type !== 'code') return;

    const code = codeMirrorEditor.getValue();
    runBtn.disabled = true;
    setOutputs({ message: 'Running your code…', status: 'info' });

    try {
        const pyo = await ensurePyodide();

        // Override input() to use browser prompt
        await pyo.runPythonAsync(`
import builtins
def js_input(prompt_text=""):
    from js import prompt
    return prompt(prompt_text)
builtins.input = js_input
`);

        // Capture stdout and stderr
        const prolog = `
import sys, io
_stdout_buffer = io.StringIO()
_stderr_buffer = io.StringIO()
_sys_stdout, _sys_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _stdout_buffer, _stderr_buffer
`;

        const epilog = `
_out_text = _stdout_buffer.getvalue()
_err_text = _stderr_buffer.getvalue()
sys.stdout, sys.stderr = _sys_stdout, _sys_stderr
`;

        await pyo.runPythonAsync(prolog + code + epilog);

        const outText = pyo.globals.get('_out_text') || '';
        const errText = pyo.globals.get('_err_text') || '';

        if (errText) setOutputs({ message: `Error:\n${errText}`, status: 'error' });
        else if (outText) setOutputs({ message: `Output:\n${outText}`, status: 'success' });
        else setOutputs({ message: 'Code executed successfully (no output)', status: 'success' });

    } catch (err) {
        setOutputs({ message: `Error: ${err.message}`, status: 'error' });
    } finally {
        runBtn.disabled = false;
    }
}
function checkCodeStructure(code, requirements) {
    const errors = [];

    // Check for required function definitions
    if (requirements.functions) {
        requirements.functions.forEach(fn => {
            if (!code.includes(`def ${fn}(`)) {
                errors.push(`Missing required function: ${fn}`);
            }
        });
    }

    // Check if 'for' loop is required
    if (requirements.mustUseForLoop && !code.includes('for ')) {
        errors.push("Missing required 'for' loop");
    }

    // Check if 'while' loop is required
    if (requirements.mustUseWhileLoop && !code.includes('while ')) {
        errors.push("Missing required 'while' loop");
    }

    // Check forbidden patterns
    if (requirements.forbidden && requirements.forbidden.some(f => code.includes(f))) {
        errors.push("Forbidden usage detected: " + requirements.forbidden.filter(f => code.includes(f)).join(', '));
    }

    return errors; // Empty array = passed structure check
}

async function submitCurrentCode() {                             // Define an async function: allows use of await for Pyodide calls.
    const item = linearItems[currentQuestionIndex];              // Grab the current question/item from a linear list.
    if (!item || item.type !== 'code') return;                   // Guard: exit if no item or it isn’t a code-type question.

    const code = codeMirrorEditor.getValue();                    // Read the student’s code from the CodeMirror editor.
    runBtn.disabled = true;                                      // Disable the "Run" button to prevent double-submits.
    submitBtn.disabled = true;                                   // Disable the "Submit" button too.
    setOutputs({
        message: 'Submitting your code…',               // Show a status message in the UI…
        status: 'info'
    });

    try {                                                        // Begin main try: most of the logic lives here.
        const pyo = await ensurePyodide();                       // Ensure Pyodide is loaded and get a handle to it.

        // Get test cases from the current item
        let testCases = item.data.testCases || [];               // Pull test cases from the item (may be empty).
        // Backward compatibility: if only expectedOutput is provided, create a basic single test
        if (testCases.length === 0 && item.data.expectedOutput) { // If no testCases but an expectedOutput exists…
            testCases = [{                                       // …build a single I/O test case from it.
                mode: 'io',
                input: [],
                expected: String(item.data.expectedOutput).trim()
            }];
        }
        if (testCases.length === 0) {                            // Still no tests? That’s a hard error.
            throw new Error('No test cases defined for this problem');
        }

        const structureReqs = item.data.structureRequirements || {};
        const structureErrors = checkCodeStructure(code, structureReqs);

        if (structureErrors.length > 0) {
            setOutputs({
                message: '❌ Structure check failed:\n' + structureErrors.join('\n'),
                status: 'error'
            });

            answeredMap.set(`${currentTopicIndex}-${currentQuestionIndex}`, {
                status: 'incorrect',
                topic: item.topic,
                answer: code,
                correctAnswer: 'Fix structure errors: ' + structureErrors.join('; ')
            });

            return; // Stop execution if structure fails
        }

        let allPassed = true;                                    // Track overall pass/fail across all tests.
        const results = [];                                      // Collect per-test results for reporting.

        // Run each test case
        for (let i = 0; i < testCases.length; i++) {             // Iterate through every test case…
            const testCase = testCases[i];                       // …current test case.

            try {                                                // Per-test try: failures in one test don’t stop others.
                const mode = (testCase.mode ||                   // Determine mode: explicit testCase.mode if set…
                    (testCase.call ? 'function' : 'io')); // …else infer: if .call exists → 'function', else 'io'.

                if (mode === 'io') {                             // =========== I/O MODE (print/input based tasks) ===========
                    // Clear and set up IO capture and mocked input
                    await pyo.runPythonAsync(`                  
import sys, io, json, builtins
_stdout_buffer = io.StringIO()
_stderr_buffer = io.StringIO()
_sys_stdout, _sys_stderr = sys.stdout, sys.stderr
sys.stdout, sys.stderr = _stdout_buffer, _stderr_buffer

_test_inputs_json = '''${JSON.stringify(Array.isArray(testCase.input) ? testCase.input : [testCase.input])}'''
_test_inputs = json.loads(_test_inputs_json)
_input_index = 0

def mock_input(prompt=""):
    global _input_index
    if _input_index < len(_test_inputs):
        value = _test_inputs[_input_index]
        _input_index += 1
        return str(value)
        return ""

builtins.input = mock_input
`);                                                             // ↑ Captures stdout/stderr, prepares a mock input() queue,
                    // and monkey-patches builtins.input to feed test inputs.
                    // NOTE: the second `return ""` is unreachable dead code.

                    // Execute the user's code in an isolated namespace per test
                    await pyo.runPythonAsync(`
_ns = {}
exec("""${code.replace(/"""/g, '\\"\\"\\"')}""", _ns, _ns)`);   // ↑ Loads JS string safely via JSON, execs into _ns dict.

                    // Restore and capture
                    await pyo.runPythonAsync(`                   
_out_text = _stdout_buffer.getvalue()
_err_text = _stderr_buffer.getvalue()
sys.stdout, sys.stderr = _sys_stdout, _sys_stderr
`);

                    const outText = pyo.globals.get('_out_text') || ''; // Get captured stdout back into JS.
                    const errText = pyo.globals.get('_err_text') || ''; // Get captured stderr back into JS.
                    if (errText) throw new Error(errText);       // If any errors were printed, treat test as failed.

                    // For IO tasks, allow selecting which lines to compare
                    const linesMode = testCase.lines ||          // Decide whether to compare only last line or all lines.
                        (testCase.onlyLastLine === false ? 'all' : 'last'); // default is 'last'.
                    const cleanedLines = outText.split('\n')     // Split output into lines…
                        .map(s => s.trim())
                        .filter(Boolean); // …trim and drop blank lines.
                    const actualOutput =                         // Build comparable output string:
                        linesMode === 'last'                     // - last line only, or
                            ? (cleanedLines[cleanedLines.length - 1] || '')
                            : cleanedLines.join(' ');                // - all lines joined by spaces.

                    // Optional strict mode (no normalization)
                    if (testCase.strict === true) {              // If strict mode: exact string equality only.
                        const passedStrict = actualOutput === String(testCase.expected);
                        const passed = passedStrict;
                        if (!passed) allPassed = false;          // Track global failure.
                        results.push({                           // Record detailed result for this test.
                            testNumber: i + 1,
                            input: Array.isArray(testCase.input) ? testCase.input : [testCase.input],
                            expected: testCase.expected,
                            actual: actualOutput,
                            passed: passed,
                            fullOutput: outText
                        });
                        continue;                                // Move to next test (skip flexible matching below).
                    }

                    // Regex mode for flexible matching
                    if (testCase.compare === 'regex' &&          // If regex comparison is requested…
                        typeof testCase.expectedRegex === 'string') {
                        let re = null;
                        try {
                            re = new RegExp(testCase.expectedRegex);
                        } catch (_) {
                            re = null;                           // Bad regex → automatically fail.
                        }
                        const passed = re ? re.test(actualOutput) : false; // Test regex against actual.
                        if (!passed) allPassed = false;
                        results.push({                           // Record result.
                            testNumber: i + 1,
                            input: Array.isArray(testCase.input) ? testCase.input : [testCase.input],
                            expected: `/${testCase.expectedRegex}/`,
                            actual: actualOutput,
                            passed: passed,
                            fullOutput: outText
                        });
                        continue;                                // Move to next test.
                    }

                    // Normalize both sides: lowercase, collapse spaces, normalize punctuation spacing
                    const normalize = (s) => {                   // Helper to make comparisons tolerant of spacing/case.
                        let t = String(s).toLowerCase().trim();
                        t = t.replace(/\s+/g, ' ');            // collapse spaces
                        t = t.replace(/\s*,\s*/g, ', ');       // comma spacing -> ", "
                        t = t.replace(/\s*:\s*/g, ': ');       // colon spacing -> ": "
                        t = t.replace(/\s*;\s*/g, '; ');       // semicolon spacing
                        t = t.replace(/\s*\.\s*/g, '.');       // no space before period
                        t = t.replace(/\s*!\s*/g, '!');        // no space before exclamation
                        t = t.replace(/\s*\?\s*/g, '?');       // no space before question mark
                        return t;
                    };
                    const stripPunct = (s) => normalize(s).replace(/[.,;:!?"'`]/g, ''); // Remove punctuation.
                    const stripControl = (s) => normalize(s).replace(/[\u0000-\u001F\u007F]/g, ''); // Remove control chars.
                    const expectedOutput = normalize(testCase.expected); // Pre-normalize expected.
                    const actualOutputLower = normalize(actualOutput);   // Pre-normalize actual.
                    let passed = (actualOutputLower === expectedOutput); // 1) exact match after normalization?
                    if (!passed) {                          // If not, try some fallbacks…
                        const actualNoP = stripPunct(actualOutput);      // …punctuation-insensitive…
                        const expectedNoP = stripPunct(testCase.expected);
                        passed = passed || (actualOutputLower.includes(expectedOutput)); // …substring ok…
                        passed = passed || (actualNoP === expectedNoP);                  // …or full eq w/o punct…
                        passed = passed || (actualNoP.includes(expectedNoP));           // …or substring w/o punct.
                        const actualNoCtrl = stripControl(actualOutput);                // …ignore control chars…
                        passed = passed || (normalize(actualNoCtrl) === expectedOutput);// …and compare again.
                    }

                    if (!passed) allPassed = false;           // Update global flag.
                    results.push({                            // Save result (and the full output for debugging).
                        testNumber: i + 1,
                        input: Array.isArray(testCase.input) ? testCase.input : [testCase.input],
                        expected: testCase.expected,
                        actual: actualOutput,
                        passed: passed,
                        fullOutput: outText
                    });

                } else if (mode === 'function') {             // =========== FUNCTION MODE (call and compare return) ===========
                    // Execute user's code to define functions in isolated namespace
                    await pyo.runPythonAsync(`                
import json
_ns = {}
exec("""${code.replace(/"""/g, '\\"\\"\\"')}""", _ns, _ns)
`);

                    // Prepare function call with JSON-encoded args/kwargs
                    const call = testCase.call || {};         // Call specification: { name, args, kwargs }.
                    const funcName = call.name;               // Function name to call.
                    const argsJson = JSON.stringify(call.args || []); // Positional args serialized.
                    const kwargsJson = JSON.stringify(call.kwargs || {}); // Keyword args serialized.
                    const expectedProvided = Object.prototype.hasOwnProperty.call(testCase, 'expectedReturn'); // Did test set an expectedReturn?
                    const expectedPy = testCase.expectedPy;   // Optional Python expression string to compute expected.

                    await pyo.runPythonAsync(`                
import json
_fn_name = ${JSON.stringify(funcName)}
_args = json.loads('''${argsJson}''')
_kwargs = json.loads('''${kwargsJson}''')
_expected_set = ${expectedProvided ? 'True' : 'False'}
_expected_return = json.loads('''${expectedProvided ? JSON.stringify(testCase.expectedReturn) : 'null'}''') if _expected_set else None
_expected_py_expr = ${expectedPy ? JSON.stringify(expectedPy) : 'None'}

# Resolve function
_target_fn = _ns.get(_fn_name)
if _target_fn is None:
    raise NameError(f"Function '{_fn_name}' not found")

_result_value = _target_fn(*_args, **_kwargs)

if _expected_py_expr is not None:
    _expected_obj = eval(_expected_py_expr)
else:
    _expected_obj = _expected_return

_function_passed = (_result_value == _expected_obj)
`);                                                          // ↑ Calls the user function and compares result vs expected.

                    const passed = Boolean(pyo.globals.get('_function_passed')); // Pull pass/fail back to JS.
                    if (!passed) allPassed = false;            // Update global summary.

                    // Convert result and expected to strings for reporting
                    await pyo.runPythonAsync(`              
_result_str = str(_result_value)
_expected_str = str(_expected_obj)
`);
                    const actualStr = pyo.globals.get('_result_str') || '';   // Fetch actual as string.
                    const expectedStr = pyo.globals.get('_expected_str') || '';// Fetch expected as string.

                    results.push({                            // Save a concise per-test record for function mode.
                        testNumber: i + 1,
                        input: { call: call },
                        expected: expectedPy ? expectedPy : testCase.expectedReturn,
                        actual: actualStr,
                        passed: passed
                    });
                } else {                                      // Unknown mode guard.
                    throw new Error(`Unknown test mode: ${mode}`);
                }

                // Clean up
                ['_stdout_buffer', '_stderr_buffer',          // After each test, attempt to delete temp Python globals
                    '_sys_stdout', '_sys_stderr',                // from the Pyodide global namespace (best effort).
                    '_out_text', '_err_text',
                    '_test_inputs', '_input_index'].forEach(varName => {
                        if (pyo.globals.has(varName)) {           // If present…
                            pyo.globals.delete(varName);           // …delete it.
                        }
                    });

            } catch (error) {                                  // Per-test failure handler (runtime errors, asserts, etc.)
                allPassed = false;                             // Mark overall as not all-passed.
                results.push({                                 // Record this test’s error details.
                    testNumber: i + 1,
                    input: Array.isArray(testCase.input) ? testCase.input : [testCase.input],
                    expected: testCase.expected,
                    actual: `Error: ${error.message}`,
                    passed: false
                });
            }
        }

        // Generate test results message
        let resultMessage = '';                                 // Start building the summary message shown to the user.
        if (allPassed) {
            resultMessage = '✅ All tests passed!\n\n';         // Happy path header.
        } else {
            resultMessage = '❌ Some tests failed:\n\n';        // Failure header.
        }

        // Add detailed test results: hide passed test details, show only failures
        const failed = results.filter(r => !r.passed);          // Compute failed subset.
        const passedCount = results.length - failed.length;     // Count passes.
        if (failed.length === 0) {                              // If none failed…
            // resultMessage += `All ${results.length} tests passed.\n`; // …say so concisely.
        } else {
            resultMessage += `${passedCount} passed, ${failed.length} failed.\n\n`; // Summary counts.
            failed.forEach(result => {                          // For each failed test, print a detailed block:
                resultMessage += `Test ${result.testNumber}: ❌ FAIL\n`;
                resultMessage += `  Input: ${JSON.stringify(result.input)}\n`;
                resultMessage += `  Expected: "${result.expected}"\n`;
                resultMessage += `  Got: "${result.actual}"\n`;
                resultMessage += '\n';
            });
        }

        // Update progress and UI
        const status = allPassed ? 'correct' : 'incorrect';     // Decide a compact status label.
        answeredMap.set(`${currentTopicIndex}-${currentQuestionIndex}`, { // Persist answer status for nav/progress.
            status: status,
            topic: item.topic,
            answer: code,
            correctAnswer: allPassed ? 'All tests passed' : 'Check expected vs actual output'
        });

        setOutputs({                                            // Push the summary message to the UI with success/error.
            message: resultMessage,
            status: allPassed ? 'success' : 'error'
        });

        updateTopicProgress();                                  // Recompute topic-level progress bar/badges.
        renderQuestionNav();                                    // Rerender question navigation (e.g., checkmarks).
        checkTopicCompletion();                                 // Possibly unlock next topic / mark as complete.

        // Make editor read-only after submission
        // if (codeMirrorEditor) {                                 // Prevent editing after submission for this attempt.
        //     codeMirrorEditor.setOption('readOnly', true);
        // }

    } catch (err) {                                             // Outer catch: problems outside per-test loop (e.g., setup).
        console.error('Error in submitCurrentCode:', err);      // Log to console for devs.

        let errorMessage = '❌ Submission failed: ';            // Build user-facing failure message.
        if (err.message.includes('SyntaxError')) {              // Heuristic: syntax errors in Python → friendlier hint.
            errorMessage += 'Check your Python syntax';
        } else {
            errorMessage += err.message;                        // Otherwise show the raw message.
        }

        setOutputs({ message: errorMessage, status: 'error' }); // Show the error in the UI.

        answeredMap.set(`${currentTopicIndex}-${currentQuestionIndex}`, { // Record as incorrect for progress.
            status: 'incorrect',
            topic: item.topic,
            answer: code,
            correctAnswer: 'Fix the errors in your code'
        });

        updateTopicProgress();                                   // Keep UI in sync even on failure.
        renderQuestionNav();
        checkTopicCompletion();
    } finally {                                                  // Always re-enable buttons at the very end.
        runBtn.disabled = false;
        submitBtn.disabled = false;
    }
}


// ----------------------
// Progress tracking
// ----------------------
function updateTopicProgress() {
    if (!currentModuleData || !currentModuleData.topics[currentTopicIndex]) return;

    const topic = currentModuleData.topics[currentTopicIndex];
    const progress = topicProgress.get(topic.name);
    let completed = 0;
    let correct = 0;

    linearItems.forEach((item, idx) => {
        const answer = answeredMap.get(`${currentTopicIndex}-${idx}`);
        if (answer) {
            completed++;
            if (answer.status === 'correct') correct++;
        }
    });

    progress.completed = completed;
    progress.correct = correct;

}

function checkTopicCompletion() {
    if (!currentModuleData || !currentModuleData.topics[currentTopicIndex]) return;

    const topic = currentModuleData.topics[currentTopicIndex];
    const progress = topicProgress.get(topic.name);

    // if (progress.completed === progress.total) {
    //     finishTopicAssessment();
    // }
}

function checkAllTopicsCompleted() {
    if (!currentModuleData || !currentModuleData.topics) return false;

    return currentModuleData.topics.every(topic => {
        const progress = topicProgress.get(topic.name);
        return progress.completed === progress.total;
    });
}


function setOutputs(payload = {}) {
    const feedbackEl = document.getElementById('codeFeedback');
    const feedbackTextEl = document.getElementById('codeFeedbackText');

    if (!payload.message) {
        feedbackEl.style.display = 'none';
        return;
    }

    feedbackEl.style.display = 'block';
    feedbackTextEl.textContent = payload.message;

    // Remove existing classes
    feedbackEl.classList.remove('success', 'error', 'info');

    // Add appropriate class based on status
    if (payload.status === 'success') {
        feedbackEl.classList.add('success');
    } else if (payload.status === 'error') {
        feedbackEl.classList.add('error');
    } else {
        feedbackEl.classList.add('info');
    }
}
function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
}


function escapeForPre(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


function setupEventListeners() {
    letsBeginBtn.addEventListener('click', showTopicSelection);
    mcqSubmitBtn.addEventListener('click', submitCurrentMcq);
    runBtn.addEventListener('click', runCurrentCode);
    submitBtn.addEventListener('click', submitCurrentCode);
    finishBtn.addEventListener('click', finishTopicAssessment);
}


function showTopicSelection() {

    window.scrollTo(0, 0);
    // Hide welcome pane and show topic selection pane
    document.getElementById('welcomePane').style.display = 'none';
    document.getElementById('topicSelectionPane').style.display = 'block';
}

function submitCurrentMcq() {
    const item = linearItems[currentQuestionIndex];
    if (item.type !== "mcq") return;

    const selected = document.querySelector(
        `input[name="mcq_${currentTopicIndex}_${currentQuestionIndex}"]:checked`
    );

    if (!selected) {
        alert("Please select an option.");
        return;
    }

    // Check correctness
    const isCorrect = parseInt(selected.value) === item.data.answer;
    answeredMap.set(`${currentTopicIndex}-${currentQuestionIndex}`, {
        status: isCorrect ? "correct" : "incorrect",
        topic: item.topic,
        answer: selected.value,
        correctAnswer: item.data.answer
    });

    updateTopicProgress();
    renderQuestionNav();
    checkTopicCompletion();

    // Move to next question if available
    if (currentQuestionIndex < linearItems.length - 1) {
        currentQuestionIndex++;
        renderCurrentItem();
    }
}

function finishTopicAssessment() {
    const confirmFinish = confirm('Are you sure you want to finish this topic?');
    if (!confirmFinish) return;

    document.getElementById('assessmentArea').style.display = 'none';

    const topic = currentModuleData.topics[currentTopicIndex];

    // Mark all unanswered questions as "unanswered"
    linearItems.forEach((item, idx) => {
        const key = `${currentTopicIndex}-${idx}`;
        if (!answeredMap.has(key)) {
            answeredMap.set(key, {
                status: 'unanswered',
                topic: item.topic,
                answer: 'Unanswered',
                correctAnswer: item.type === 'mcq'
                    ? item.data.options[item.data.answer]
                    : 'Function that passes all test cases'
            });
        }
    });

    // Mark topic completed in localStorage
    markTopicCompleted(topic.name);

    // Update topic progress
    updateTopicProgress();

    // Persist per-topic score in localStorage for overall results
    try {
        const topic = currentModuleData.topics[currentTopicIndex];
        const progress = topicProgress.get(topic.name);
        const stored = JSON.parse(localStorage.getItem('topicScores') || '{}');
        stored[topic.name] = { correct: progress.correct, total: progress.total };
        localStorage.setItem('topicScores', JSON.stringify(stored));
        localStorage.setItem('answeredMap', JSON.stringify(Array.from(answeredMap.entries())));

    } catch (e) {
        console.warn('Unable to persist topic scores:', e);
    }

    // Show topic report with all answers
    showTopicReport(true); // pass true to indicate "finished by student"
}

function markTopicCompleted(topicName) {
    const completedTopics = JSON.parse(localStorage.getItem('completedTopics') || '[]');
    if (!completedTopics.includes(topicName)) {
        completedTopics.push(topicName);
        localStorage.setItem('completedTopics', JSON.stringify(completedTopics));
    }
}

function showTopicReport(showAnswers = true) {
    window.scrollTo(0, 0);
    const topic = currentModuleData.topics[currentTopicIndex];
    const progress = topicProgress.get(topic.name);

    // Hide question container
    questionContainer.style.display = 'none';

    // Show report view
    topicReportView.style.display = 'block';
    topicReportView.scrollIntoView({ behavior: 'smooth' }); // scroll to top

    const header = topicReportView.querySelector('#topicReportHeader');
    header.textContent = `${topic.name} - Topic Complete!`;

    const content = topicReportView.querySelector('#topicReportContent');
    content.innerHTML = `
        <div class="report-summary">
            <h3>Topic Performance: ${progress.correct}/${progress.total} Correct</h3>
            <p>Score: ${Math.round((progress.correct / progress.total) * 100)}%</p>
        </div>
        <div class="topic-report">
            <h4>Review Your Answers</h4>
            ${generateTopicQuestionResults(showAnswers)}
        </div>
    `;

    // Enable Back / Next buttons
    const backBtn = topicReportView.querySelector('#backToTopicsBtn');
    backBtn.onclick = () => {
        topicReportView.style.display = 'none';
        document.getElementById('topicSelectionPane').style.display = 'block';
        disableCompletedTopics();
    };

    const continueBtn = topicReportView.querySelector('#continueToNextTopicBtn');
    continueBtn.onclick = () => {
        topicReportView.style.display = 'none';
        const nextIndex = currentTopicIndex + 1;
        if (nextIndex < currentModuleData.topics.length) {
            switchToTopic(nextIndex);
        } else {
            alert('No more topics left!');
            document.getElementById('topicSelectionPane').style.display = 'block';
        }
    };

    // Show overall results button if all topics are completed
    const overallBtn = topicReportView.querySelector('#showOverallResultsBtn');
    if (overallBtn) {
        if (checkAllTopicsCompleted()) {
            overallBtn.style.display = '';
            overallBtn.onclick = () => {
                topicReportView.style.display = 'none';
                showOverallResults();
            };
        } else {
            overallBtn.style.display = 'none';
            overallBtn.onclick = null;
        }
    }
}

function generateTopicQuestionResults(showAnswers = true) {

    let html = '';
    const topic = currentModuleData.topics[currentTopicIndex];
    linearItems = [];

    // Add MCQs for this topic
    (topic.mcqs || []).forEach(q => {
        linearItems.push({
            type: 'mcq',
            data: q,
            topic: topic.name
        });
    });

    // Add code tasks for this topic
    (topic.codeTasks || []).forEach(t => {
        linearItems.push({
            type: 'code',
            data: t,
            topic: topic.name
        });
    });

    var temp = new Map(JSON.parse(localStorage.getItem('answeredMap') || '{}'))

    linearItems.forEach((item, idx) => {

        const answer = temp.get(`${currentTopicIndex}-${idx}`) || {
            status: 'unanswered',
            topic: item.topic,
            answer: 'Unanswered',
            correctAnswer: item.type === 'mcq'
                ? item.data.options[item.data.answer]
                : 'Function that passes all test cases'
        };

        // Ensure we show the question text with the same renderer used for MCQs/code prompts
        const questionRaw = item.type === 'mcq' ? item.data.question : (item.data.question || item.data.title || 'Coding Task');
        const questionText = renderQuestionText(questionRaw);
        const statusClass = answer.status === 'correct' ? 'correct'
            : answer.status === 'incorrect' ? 'incorrect'
                : 'unanswered';
        const statusText = answer.status === 'correct' ? 'Correct'
            : answer.status === 'incorrect' ? 'Incorrect'
                : 'Unanswered';

        html += `<div class="question-result ${item.type === 'code' ? 'code-task' : ''}">
                    <div class="question-text">${questionText}</div>           
                    <span class="result-status ${statusClass}">${statusText}</span>`;

        if (showAnswers) {
            if (item.type === 'mcq') {
                const correctOption = escapeHtml(item.data.options[item.data.answer]);
                const studentAnswer = escapeHtml(item.data.options[answer.answer] || answer.answer);
                html += `<div class="answers-wrapper">
                    <div style="font-size:15px"><strong>Your Answer:</strong> ${studentAnswer}</div>
                    <div style="font-size:15px"><strong>Correct Answer:</strong> ${correctOption}</div>
                 </div>`;
            } else {
                // Show correct solution code if available; otherwise show expected summary from tests
                const testCases = item.data.testCases || [];
                let expectedSummary = '';
                if (testCases.length) {
                    expectedSummary = testCases.map((tc, i) => {
                        const mode = tc.mode || (tc.call ? 'function' : 'io');
                        if (mode === 'io') {
                            const inputs = Array.isArray(tc.input) ? tc.input : [tc.input];
                            return `Test ${i + 1}: input=${escapeForPre(inputs.join(', '))} → ${escapeForPre(tc.expected)}`;
                        } else {
                            const call = tc.call || {};
                            const argList = Array.isArray(call.args) ? call.args.map(a => String(a)).join(', ') : '';
                            const callStr = `${call.name || 'function'}(${argList})`;
                            const expectedStr = tc.expectedPy ? tc.expectedPy : String(tc.expectedReturn);
                            return `Test ${i + 1}: ${escapeForPre(callStr)} → ${escapeForPre(expectedStr)}`;
                        }
                    }).join('\n');
                } else {
                    expectedSummary = 'Function that passes all test cases';
                }

                const solutionBlock = item.data.solutionCode
                    ? `<div style="margin-top:6px"><strong>Correct Code:</strong></div><pre>${escapeForPre(item.data.solutionCode)}</pre>`
                    : `<div style=\"margin-top:6px\"><strong>Expected (passes these tests):</strong></div><pre>${escapeForPre(expectedSummary)}</pre>`;

                html += `<div class="answers-wrapper">
                    <div style="font-size:15px"><strong>Your Code:</strong></div>
                    <pre>${escapeForPre(answer.answer)}</pre>
                    ${solutionBlock}
                 </div>`;
            }
        }

        html += `</div>`;
    });
    return html;
}

// Disable completed topics
function disableCompletedTopics() {
    const completedTopics = JSON.parse(localStorage.getItem('completedTopics') || '[]');
    currentModuleData.topics.forEach((topic, index) => {
        const isCompleted = completedTopics.includes(topic.name);
        if (isCompleted) {
            const btn = topicSelectionGrid.children[index];
            btn.disabled = true;
            btn.classList.add('completed');
        }
    });

    // Also update the top-level results button visibility when returning
    const showOverallTop = document.getElementById('showOverallResultsBtnTop');
    if (showOverallTop) {
        if (completedTopics.length && currentModuleData.topics && completedTopics.length === currentModuleData.topics.length) {
            showOverallTop.style.display = '';
            showOverallTop.onclick = () => {
                document.getElementById('topicSelectionPane').style.display = 'none';
                showOverallResults();
            };
        } else {
            showOverallTop.style.display = 'none';
            showOverallTop.onclick = null;
        }
    }
}


function generateCorrectAnswers() {
    let html = '';
    linearItems.forEach((item, idx) => {
        const answer = answeredMap.get(`${currentTopicIndex}-${idx}`);
        if (answer) {
            const questionText = item.type === 'mcq' ? item.data.question : item.data.title;

            if (item.type === 'mcq') {
                const correctOption = item.data.options[item.data.answer];
                html += `
                    <div class="question-result">
                        <span>${questionText}</span>
                        <div style="text-align: right;">
                            <div><strong>Your Answer:</strong> ${answer.answer}</div>
                            <div><strong>Correct Answer:</strong> ${correctOption}</div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="question-result">
                        <span>${questionText}</span>
                        <div style="text-align: right;">
                            <div><strong>Your Code:</strong> Submitted</div>
                            <div><strong>Expected:</strong> Function that passes all test cases</div>
                        </div>
                    </div>
                `;
            }
        }
    });
    return html;
}

// ----------------------
// Boot
// ----------------------
async function boot() {
    await loadModuleIntoUI();
    setupEditor();
    setupEventListeners();
}

// Start
boot();

// ----------------------
// Overall Results (Chart)
// ----------------------
function showOverallResults() {

    window.scrollTo(0, 0);
    // Hide other views
    const sel = document.getElementById('topicSelectionPane');
    if (sel) sel.style.display = 'none';
    const assess = document.getElementById('assessmentArea');
    if (assess) assess.style.display = 'none';
    const view = document.getElementById('overallResultsView');
    view.style.display = 'block';

    // Build data from persisted scores in localStorage; fallback to in-memory progress
    const labels = [];
    const scores = [];
    const rows = [];

    const stored = JSON.parse(localStorage.getItem('topicScores') || '{}');

    currentModuleData.topics.forEach(t => {
        labels.push(t.name);
        const saved = stored[t.name];
        let pct = 0;
        if (saved && typeof saved.correct === 'number' && typeof saved.total === 'number' && saved.total > 0) {
            pct = Math.round((saved.correct / saved.total) * 100);
            totalQuestions += saved.total; totalCorrect += saved.correct;
            rows.push({ topic: t.name, correct: saved.correct, total: saved.total, score: pct });
        } else {
            const prog = topicProgress.get(t.name);
            if (prog && prog.total > 0) pct = Math.round((prog.correct / prog.total) * 100);
            if (prog) { totalQuestions += prog.total; totalCorrect += prog.correct; rows.push({ topic: t.name, correct: prog.correct, total: prog.total, score: pct }); }
        }
        scores.push(pct);
    });

    // Render chart via Chart.js
    const canvas = document.getElementById('overallChart');
    const ctx = canvas.getContext('2d');
    if (window.__overallChart) {
        window.__overallChart.destroy();
    }
    window.__overallChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Score (%)',
                data: scores,
                backgroundColor: 'rgba(52, 211, 153, 0.6)',
                borderColor: 'rgba(22, 163, 74, 1)',
                borderWidth: 1,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(22, 163, 74, 0.8)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: (v) => `${v}%`
                    },
                    grid: { color: 'rgba(148, 163, 184, 0.2)' }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        autoSkip: false,
                        font: { size: 12 }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            // context.dataIndex gives the index of the hovered item
                            let value = scores[context.dataIndex];
                            return `${context.label}: ${value}%`;
                        }
                    }
                }
            }
        }
    });

    // Update summary metrics and table
    const topicsCount = currentModuleData.topics.length;
    const overallPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const sub = document.getElementById('overallSubheading');
    if (sub) sub.textContent = `Performance overview across ${topicsCount} topics`;
    const mTop = document.getElementById('metricTopics'); if (mTop) mTop.textContent = String(topicsCount);
    const mQ = document.getElementById('metricQuestions'); if (mQ) mQ.textContent = String(totalQuestions);
    const mC = document.getElementById('metricCorrect'); if (mC) mC.textContent = String(totalCorrect);
    const mS = document.getElementById('metricScore'); if (mS) mS.textContent = `${overallPct}%`;

    const tbody = document.querySelector('#overallTable tbody');
    if (tbody) {
        tbody.innerHTML = '';
        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(r.topic)}</td><td>${r.correct}</td><td>${r.total}</td><td>${r.score}%</td>`;
            tbody.appendChild(tr);
        });
    }
    const reviewAnswers = document.getElementById('reviewAnswers');

    currentModuleData.topics.forEach((t, i) => {
        currentTopicIndex = i;
        const div = `
        <div class="report-summary" style="align-items: center;justify-content: center;">
            <h3 style="font-size:30px; text-align:center; margin-bottom:20px">${t.name}</h3>
            ${generateTopicQuestionResults(true)}
        </div>`

        reviewAnswers.appendChild(htmlToElement(div));
    })
    // Back button
    const backBtn = document.getElementById('backFromOverallBtn');
    if (backBtn) {
        backBtn.onclick = () => {
            view.style.display = 'none';
            const tsp = document.getElementById('topicSelectionPane');
            if (tsp) tsp.style.display = 'block';
            disableCompletedTopics();
        };
    }

    // PDF download button
     if (downloadBtn) {
        downloadBtn.onclick = async () => {
            await downloadOverallResultsPdf({ labels, scores });
        };
    }

    // Email teacher button
    const emailBtn = document.getElementById('emailTeacherBtn');
    if (emailBtn) {
        emailBtn.onclick = async () => {
            await emailOverallResultsToTeacher({ labels, scores });
        };
    }

}

async function downloadOverallResultsPdf() {

    downloadBtn.disabled = true;
    btnText.textContent = 'Generating PDF...';

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const lineH = 6;
    const bottomMargin = 15; // space reserved for footer/page number
    let yPos = 10;

    const col1Width = 80; // Question
    const col2Width = 35; // Status
    const col3Width = pageWidth - margin * 2 - col1Width - col2Width; // Answers

    const split = (txt, width) => pdf.splitTextToSize(String(txt ?? ''), width);

    const loadImageAsync = (src) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = reject;
        });

    const headerImg = await loadImageAsync('assets/banner.png');
    const watermarkImg = await loadImageAsync('assets/header.png');
    const logoImg = await loadImageAsync('assets/logo.png');
    const logoWidth = 25;
    const logoHeight = (logoImg.height * logoWidth) / logoImg.width;

    // ---- Page 1: Header + Total Score + Chart + Table ----
    const headerW = 120;
    const headerH = (headerImg.height * headerW) / headerImg.width;
    pdf.addImage(headerImg, 'PNG', (pageWidth - headerW) / 2, yPos, headerW, headerH);
    yPos += headerH + 10;

    //Total score and percentage
    const percentage = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(2) : 0;

    pdf.setFontSize(12).setFont(undefined, 'bold');
    pdf.text('Total Score:', margin, yPos);
    pdf.setFont(undefined, 'normal');
    pdf.text(`${totalCorrect} / ${totalQuestions}`, margin + 35, yPos);

    pdf.setFont(undefined, 'bold');
    const percText = 'Percentage:';
    pdf.text(percText, pageWidth - margin - 50, yPos);
    pdf.setFont(undefined, 'normal');
    pdf.text(`${percentage}%`, pageWidth - margin - 12, yPos);
    yPos += 14;

    // Chart
    const chartCanvas = document.getElementById('overallChart');
    if (chartCanvas) {
        const chartUrl = chartCanvas.toDataURL('image/png', 1.0);
        const maxChartH = 80;
        let chartW = pageWidth - margin * 2;
        let chartH = (chartCanvas.height * chartW) / chartCanvas.width;
        if (chartH > maxChartH) { chartH = maxChartH; chartW = (chartCanvas.width * chartH) / chartCanvas.height; }
        pdf.addImage(chartUrl, 'PNG', margin, yPos, chartW, chartH);
        yPos += chartH + 10;
    }

    // Table
    const tableEl = document.getElementById('overallTable');
    if (tableEl) {
        pdf.autoTable({
            html: tableEl,
            startY: yPos,
            margin: { left: margin, right: margin },
            styles: { fontSize: 9 },
            theme: 'grid'
        });
        yPos = pdf.lastAutoTable.finalY + 10;
    }

    // ---- Review Answers (page 2+) ----
    pdf.addPage();
    yPos = 20;
    pdf.addImage(logoImg, 'PNG', pageWidth - logoWidth - 10, 10, logoWidth, logoHeight);

    pdf.setFontSize(14).setFont(undefined, 'bold');
    pdf.text('Review Answers', margin, yPos);
    yPos += 10;
    pdf.setFontSize(10).setFont(undefined, 'normal');

    const answeredMap = new Map(JSON.parse(localStorage.getItem('answeredMap') || '[]'));

    // ---- Updated ensureSpace function ----
    const ensureSpace = (heightNeeded) => {
        const bottomMargin = 10; // smaller margin
        if (yPos + heightNeeded > pageHeight - bottomMargin) {
            pdf.addPage();
            yPos = 20;
            // Add logo on new page
            pdf.addImage(logoImg, 'PNG', pageWidth - logoWidth - 10, 10, logoWidth, logoHeight);
        }
    };

    // Loop through topics
    for (let tIdx = 0; tIdx < currentModuleData.topics.length; tIdx++) {
        if (tIdx > 0) {
            pdf.addPage();
            yPos = 20;
            pdf.addImage(logoImg, 'PNG', pageWidth - logoWidth - 10, 10, logoWidth, logoHeight);
        }

        const topic = currentModuleData.topics[tIdx];
        linearItems = [];

        (topic.mcqs || []).forEach(q => linearItems.push({ type: 'mcq', data: q, topic: topic.name }));
        (topic.codeTasks || []).forEach(t => linearItems.push({ type: 'code', data: t, topic: topic.name }));

        // Topic header (centered and underlined)
        const topicFontSize = 12;
        pdf.setFontSize(topicFontSize).setFont(undefined, 'bold');
        const textWidth = pdf.getTextWidth(topic.name);
        const xCenter = (pageWidth - textWidth) / 2;
        ensureSpace(lineH);
        pdf.text(topic.name, xCenter, yPos);
        const underlineY = yPos + 1;
        pdf.setLineWidth(0.5);
        pdf.line(xCenter, underlineY, xCenter + textWidth, underlineY);
        yPos += lineH + 6;

        // Questions loop
        linearItems.forEach((item, qIdx) => {
            const mapKey = `${tIdx}-${qIdx}`;
            const a = answeredMap.get(mapKey) || { status: 'unanswered', answer: 'Unanswered' };

            const qText = item.type === 'mcq'
                ? item.data.question
                : (item.data.question || item.data.title || 'Coding Task');

            const statusText = a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : 'Unanswered';

            let yourAnswer, correctAnswer;
            if (item.type === 'mcq') {
                yourAnswer = a.answer === undefined ? 'Unanswered' : item.data.options[a.answer] || a.answer;
                correctAnswer = item.data.options[item.data.answer];
            } else {
                yourAnswer = a.answer === undefined ? 'Unanswered' : escapeForPre(a.answer);
                correctAnswer = item.data.solutionCode || 'Function that passes all test cases';
            }

            const answerText = `Your Answer:\n${yourAnswer}\n\nCorrect Answer:\n${correctAnswer}`;

            const leftLines = split(`Q${qIdx + 1}: ${qText}`, col1Width);
            const statusLines = split(statusText, col2Width);
            const rightLines = split(answerText, col3Width);

            const blockHeight = Math.max(leftLines.length, statusLines.length, rightLines.length) * lineH;
            ensureSpace(blockHeight);

            pdf.setFontSize(10).setFont(undefined, 'normal');
            pdf.text(leftLines, margin, yPos);

            if (a.status === 'correct') pdf.setTextColor(0, 150, 0);
            else if (a.status === 'incorrect') pdf.setTextColor(200, 0, 0);
            else pdf.setTextColor(100);
            pdf.text(statusLines, margin + col1Width + 4, yPos);
            pdf.setTextColor(0, 0, 0);

            pdf.text(rightLines, margin + col1Width + col2Width + 6, yPos);
            yPos += blockHeight + 1;
        });
    }

    // ---- Watermark on all pages ----
    const wmWidth = 180;
    const wmHeight = (watermarkImg.height * wmWidth) / watermarkImg.width;
    const wmX = (pageWidth - wmWidth + 100) / 2;
    const wmY = (pageHeight - wmHeight + 100) / 2;

    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.saveGraphicsState();
        pdf.setGState(new pdf.GState({ opacity: 0.15 }));
        pdf.addImage(watermarkImg, 'PNG', wmX, wmY, wmWidth, wmHeight, undefined, 'NONE', 55);
        pdf.restoreGraphicsState();

        pdf.setFontSize(10);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    pdf.save('performance-report.pdf');

    downloadBtn.disabled = false;
    btnText.textContent = 'Download';
}




// Email the same PDF via a webhook endpoint (needs server to relay email)
async function emailOverallResultsToTeacher({ labels, scores }) {
    try {
        // Build PDF blob by reusing generation
        if (!window.jspdf) {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });

        const img = new Image();
        img.src = 'assets/logo.png';
        await new Promise(res => { img.onload = res; img.onerror = res; });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const wmW = Math.min(200, pageW * 0.3);
        const wmH = img.naturalHeight ? (img.naturalHeight * wmW / img.naturalWidth) : wmW;
        doc.addImage(img, 'PNG', (pageW - wmW) / 2, (pageH - wmH) / 2, wmW, wmH, undefined, 'FAST');
        doc.setGState(new doc.GState({ opacity: 0.15 }));
        doc.setGState(new doc.GState({ opacity: 1 }));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Overall Results', 40, 50);
        const canvas = document.getElementById('overallChart');
        const dataUrl = canvas.toDataURL('image/png');
        const chartW = pageW - 80;
        const chartH = chartW * (canvas.height / canvas.width);
        doc.addImage(dataUrl, 'PNG', 40, 80, chartW, chartH, undefined, 'FAST');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        let y = 100 + chartH;
        y += 20;
        labels.forEach((label, i) => {
            doc.text(`${label}: ${scores[i]}%`, 40, y);
            y += 18;
        });

        const pdfBlob = doc.output('blob');

        // Send via EmailJS (configure your keys)
        if (!window.emailjs) throw new Error('EmailJS not loaded');
        if (!window.__emailjs_initialized) {
            // TODO: Replace with your EmailJS public key
            emailjs.init('JdXDu4oujbgETRzLc');
            window.__emailjs_initialized = true;
        }

        // Convert blob to base64
        const base64pdf = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(pdfBlob);
        });

        // TODO: Replace serviceId/templateId and params
        const serviceId = '';//service id in emailjs
        const templateId = '';//template id in emailjs
        const params = {
            teacher_email: '', // Teacher's email address
            subject: 'Student Assessment Results',
            message: 'Attached is the overall results PDF.',
        };
        await emailjs.send(serviceId, templateId, params);
        alert('Results emailed to teacher.');
    } catch (err) {
        alert('Failed to email results: ' + err.message + '\nPlease configure the backend endpoint.');
    }
}
