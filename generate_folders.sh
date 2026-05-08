#!/bin/bash

biomes=$(wc -l < biome_list.txt)

for ((i = 0 ; i <= $biomes ; i++)); do
  biome=$(sed -n ${i}p biome_list.txt)
  mkdir "Biome Images/$biome"
done
