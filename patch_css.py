import re

with open('popup.css', 'r') as f:
    content = f.read()

# Remove the general focus styles
content = content.replace('''button:focus-visible,
input:focus-visible {
  outline: 2px solid #4ade80;
  outline-offset: 2px;
}''', '')

# Insert them earlier in the file (e.g. before .segmented rules)
insert_point = content.find('.hint {')
new_content = content[:insert_point] + '''button:focus-visible,
input:focus-visible {
  outline: 2px solid #4ade80;
  outline-offset: 2px;
}

''' + content[insert_point:]

with open('popup.css', 'w') as f:
    f.write(new_content)
