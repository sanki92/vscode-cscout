#include <stdio.h>
#include <stdlib.h>
#include "calc.h"
#include "utils.h"

int main(int argc, char *argv[])
{
    if (argc < 4) {
        fprintf(stderr, "Usage: %s <num> <op> <num>\n", argv[0]);
        return 1;
    }

    double a = atof(argv[1]);
    char op  = argv[2][0];
    double b = atof(argv[3]);

    double result = 0.0;

    switch (op) {
        case '+': result = calc_add(a, b); break;
        case '-': result = calc_sub(a, b); break;
        case '*': result = calc_mul(a, b); break;
        case '/': result = calc_div(a, b); break;
        default:
            fprintf(stderr, "Unknown operator: %c\n", op);
            return 1;
    }

    print_result(argv[2], a, b, result);
    return 0;
}
