#include <stdio.h>
#include "utils.h"

void print_result(const char *op, double a, double b, double res)
{
    printf("%.6g %s %.6g = %.6g\n", a, op, b, res);
}

static int parse_input(const char *buf, double *a, double *b, char *op)
{
    if (!buf || !a || !b || !op)
        return -1;

    int matched = sscanf(buf, "%lf %c %lf", a, op, b);
    if (matched != 3)
        return -1;

    switch (*op) {
        case '+': case '-': case '*': case '/':
            return 0;
        default:
            fprintf(stderr, "Unknown operator: %c\n", *op);
            return -1;
    }
}

/* Defined but never called — intentionally unused for demo */
static void format_output(double value, char *buf, int len)
{
    snprintf(buf, len, "%.4f", value);
}

/* Defined but never called — intentionally unused for demo */
static void debug_log(const char *msg)
{
    fprintf(stderr, "[DEBUG] %s\n", msg);
}
