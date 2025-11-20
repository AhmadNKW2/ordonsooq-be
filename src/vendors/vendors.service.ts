import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from './entities/vendor.entity';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,
  ) {}

  async create(createVendorDto: CreateVendorDto, logoUrl?: string): Promise<Vendor> {
    const existing = await this.vendorRepository.findOne({
      where: { name: createVendorDto.name },
    });

    if (existing) {
      throw new ConflictException('Vendor with this name already exists');
    }

    const vendor = this.vendorRepository.create({
      ...createVendorDto,
      logo: logoUrl,
    });
    return await this.vendorRepository.save(vendor);
  }

  async findAll(): Promise<Vendor[]> {
    return await this.vendorRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Vendor> {
    const vendor = await this.vendorRepository.findOne({
      where: { id },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${id} not found`);
    }

    return vendor;
  }

  async update(id: number, updateVendorDto: UpdateVendorDto, logoUrl?: string): Promise<Vendor> {
    const vendor = await this.findOne(id);

    if (updateVendorDto.name && updateVendorDto.name !== vendor.name) {
      const existing = await this.vendorRepository.findOne({
        where: { name: updateVendorDto.name },
      });
      if (existing) {
        throw new ConflictException('Vendor with this name already exists');
      }
    }

    Object.assign(vendor, updateVendorDto);
    if (logoUrl) {
      vendor.logo = logoUrl;
    }
    return await this.vendorRepository.save(vendor);
  }

  async remove(id: number): Promise<void> {
    const vendor = await this.findOne(id);
    await this.vendorRepository.remove(vendor);
  }
}
