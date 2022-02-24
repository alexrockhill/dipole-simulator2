# Contributions

Contributions are welcome in the form of feedback and discussion in issues,
or pull requests for changes to the code.

Once the implementation of a piece of functionality is considered to be bug
free and properly documented (both API docs and an example script),
it can be incorporated into the `main` branch.

To help developing `dipole-simulator2`, you will need a few adjustments to your
installation as shown below.

Before submitting a pull request, we recommend that you run all style checks
and the test suite, and build the documentation **locally** on your machine.
That way, you can fix errors with your changes before submitting something
for review.

**All contributions are expected to follow the**
[**Code of Conduct of the mne-tools GitHub organization.**](https://github.com/mne-tools/.github/blob/master/CODE_OF_CONDUCT.md)

## Setting up a development environment

Once you've installed the requirements with
`pip install -r requirements.txt`, then all you have to do is
 make the documentation with `make`.

## Making style checks

We run several style checks:

```Shell
make pep
```
