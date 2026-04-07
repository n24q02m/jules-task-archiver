import sys

def main():
    file_path = 'tests/background.test.js'
    with open(file_path, 'r') as f:
        content = f.read()

    bad_part = '    const response = ")]}\'\n\n100\n[["incomplete"'
    good_part = '    const response = ")]}\'\n\n100\n[[\"incomplete"'

    new_content = content.replace(bad_part, good_part)

    with open(file_path, 'w') as f:
        f.write(new_content)
    print("Fixed tests/background.test.js SyntaxError")

if __name__ == "__main__":
    main()
