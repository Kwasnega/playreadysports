def calculate(num1: float, num2: float, operation: str) -> float:
    """
    Perform arithmetic operations on two numbers.
    
    Supported operations:
    - 'add' or '+'
    - 'subtract' or '-'
    - 'multiply' or '*'
    - 'divide' or '/'
    """
    operation = operation.strip().lower()
    
    if operation in ('add', '+'):
        return num1 + num2
    elif operation in ('subtract', '-'):
        return num1 - num2
    elif operation in ('multiply', '*'):
        return num1 * num2
    elif operation in ('divide', '/'):
        if num2 == 0:
            raise ValueError("Error: Division by zero is undefined.")
        return num1 / num2
    else:
        raise ValueError(f"Error: Unsupported operation '{operation}'. Please use add (+), subtract (-), multiply (*), or divide (/).")

if __name__ == "__main__":
    import sys
    
    print("=" * 40)
    print("        Python Simple Calculator")
    print("=" * 40)
    
    # Check if arguments were passed via command line
    if len(sys.argv) >= 4:
        try:
            op = sys.argv[1]
            n1 = float(sys.argv[2])
            n2 = float(sys.argv[3])
            result = calculate(n1, n2, op)
            print(f"Calculation: {n1} {op} {n2}")
            print(f"Result     : {result}")
        except ValueError as e:
            print(e)
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
    else:
        # Interactive mode
        try:
            n1 = float(input("Enter first number: "))
            op = input("Enter operation (add/+/subtract/-/multiply/*/divide//): ")
            n2 = float(input("Enter second number: "))
            
            result = calculate(n1, n2, op)
            print("-" * 40)
            print(f"Result: {result}")
            print("-" * 40)
        except ValueError as e:
            print(e)
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
