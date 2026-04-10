import sys

with open('tests/background.test.js', 'r') as f:
    lines = f.readlines()

# It seems I have a '}' and a '})' at the end.
# The '}' is probably from the 'it' or 'describe'.
# Let's see the context of the last few lines.

for i in range(len(lines)-5, len(lines)):
    print(f"{i+1}: {repr(lines[i])}")
