import {
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
    registerDecorator,
    ValidationOptions,
} from 'class-validator';

@ValidatorConstraint({ name: 'stringOrArray', async: false })
class IsStringOrArrayOfStringsConstraint
    implements ValidatorConstraintInterface
{
    validate(text: string | string[], args: ValidationArguments) {
        return (
            typeof text === 'string' ||
            (Array.isArray(text) && text.every((t) => typeof t === 'string'))
        );
    }

    defaultMessage(_args: ValidationArguments) {
        return 'Text ($value) is not a string or an array of strings!';
    }
}

export function IsStringOrArrayOfStrings(
    property?: string,
    validationOptions?: ValidationOptions
) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isLongerThan',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [property],
            options: validationOptions,
            validator: IsStringOrArrayOfStringsConstraint,
        });
    };
}
