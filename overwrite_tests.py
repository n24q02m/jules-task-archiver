import sys

def main():
    file_path = 'tests/background.test.js'
    with open(file_path, 'r') as f:
        lines = f.readlines()

    # Target line is around 192 (0-indexed 191)
    # Let's find it by content to be safe
    target_idx = -1
    for i, line in enumerate(lines):
        if 'const response = ")]}\'\n\n100\n[["incomplete"' in line:
            target_idx = i
            break

    if target_idx != -1:
        # Use single quotes for the JS string to avoid inner double quote escaping issues in Python script
        lines[target_idx] = "    const response = ')]}\n\n100\n[[\"incomplete'\n"
        with open(file_path, 'w') as f:
            f.writelines(lines)
        print(f"Updated line {target_idx + 1}")
    else:
        print("Target line not found")

if __name__ == "__main__":
    main()
