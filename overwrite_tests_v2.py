import sys

def main():
    file_path = 'tests/background.test.js'
    with open(file_path, 'r') as f:
        lines = f.readlines()

    # Just target the line by index if content match fails
    # Based on sed output it is 192 (0-indexed 191)
    target_idx = 191
    line = lines[target_idx]
    print(f"Current line {target_idx + 1}: {line}")

    lines[target_idx] = '    const response = ")]}\'\\n\\n100\\n[[\"incomplete"\n'
    with open(file_path, 'w') as f:
        f.writelines(lines)
    print(f"Overwrote line {target_idx + 1}")

if __name__ == "__main__":
    main()
