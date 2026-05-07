import sys
import subprocess

def get_diff(filename):
    return subprocess.check_output(['git', 'diff', filename]).decode('utf-8')

# Since I haven't committed yet, I'll just show the current state vs what was there before if I can
# Actually, I'll just use the standard review tool which looks at the current state.
