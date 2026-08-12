sed -i 's/<section class="options">/<form id="mainForm">\n    <section class="options">/g' popup.html
sed -i 's/<button type="button" id="startBtn" class="primary">Start Archiving<\/button>/<button type="submit" id="startBtn" class="primary">Start Archiving<\/button>/g' popup.html
sed -i 's/<button type="button" id="resetBtn" class="secondary" style="display: none">Reset<\/button>/<button type="button" id="resetBtn" class="secondary" style="display: none">Reset<\/button>\n    <\/form>/g' popup.html

sed -i "s/const resetBtn = \$('#resetBtn')/const resetBtn = \$('#resetBtn')\nconst mainForm = \$('#mainForm')/g" popup.js
sed -i "s/startBtn.addEventListener('click', async () => {/mainForm.addEventListener('submit', async (e) => {\n  e.preventDefault()/g" popup.js

sed -i "s/cb({ target: element })/cb({ target: element, preventDefault: () => {} })/g" tests/popup.test.js
sed -i "s/'#ghOwner': createMockElement('input'),/'#mainForm': createMockElement('form'),\n    '#ghOwner': createMockElement('input'),/g" tests/popup.test.js
sed -i "s/await elements\['#startBtn'\].dispatchEvent('click')/await elements\['#mainForm'\].dispatchEvent('submit')/g" tests/popup.test.js
