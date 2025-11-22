import { PartialType } from '@nestjs/mapped-types';
import { CreateCountryWorldDto } from './create-country-world.dto';

export class UpdateCountryWorldDto extends PartialType(CreateCountryWorldDto) {}
