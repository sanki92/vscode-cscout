#include <stdio.h>
#include "calc.h"

double calc_add(double a, double b)
{
    return a + b;
}

double calc_sub(double a, double b)
{
    return a - b;
}

double calc_mul(double a, double b)
{
    return a * b;
}

double calc_div(double a, double b)
{
    if (b == 0.0) {
        fprintf(stderr, "Error: division by zero\n");
        return 0.0;
    }
    double result = a / b;
    return result;
}
